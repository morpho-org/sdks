import { MathLib, Token } from "@morpho-org/blue-sdk";
import { erc2612Abi, vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createPublicClient, custom, maxUint256, parseUnits } from "viem";
import { signTypedData } from "viem/actions";
import { describe, expect } from "vitest";
import { fetchAccrualVaultV2 } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransactions,
  encodeVaultSharesPermit,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareVaultV2Redeem,
  serializeTransactionPlan,
  vaultV2Redeem,
} from "../../../src/index.js";
import { KeyrockUsdcVaultV2, Re7UsdtVaultV2 } from "../../fixtures/vaultV2.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

const policies: readonly { supportSignature?: boolean; approved: boolean }[] = [
  { approved: false },
  { supportSignature: false, approved: false },
  { supportSignature: true, approved: false },
  { approved: true },
  { supportSignature: false, approved: true },
  { supportSignature: true, approved: true },
];

describe.each([false, true])(
  "Vault V2 redeem plan, full balance: %s",
  (fullBalance) => {
    test.for(policies)(
      "behavior: $supportSignature, approved: $approved",
      async ({ supportSignature, approved }, { client }) => {
        const { address: vault, asset } = KeyrockUsdcVaultV2;
        const account = client.account.address;
        const spender = getChainAddress(
          client.chain.id,
          "bundles.vaultBundlesV1",
        );
        const balance = parseUnits("10", 18);
        const amount = fullBalance ? balance : balance / 2n;
        await client.deal({ erc20: vault, amount: balance });
        await client.approve({
          address: vault,
          args: [spender, approved ? amount : 0n],
        });
        // A Permit2 allowance must never satisfy, or become a prerequisite for, this exit.
        await client.approve({
          address: vault,
          args: [getChainAddress(client.chain.id, "permit2"), maxUint256],
        });
        const expiresAt = Number(Time.timestamp() + 7_200n);
        const referralFeeRecipient = Re7UsdtVaultV2.address;
        const referralFeePct = MathLib.WAD / 100n;
        const initialAssets = await client.balanceOf({ erc20: asset });
        const initialFeeAssets = await client.balanceOf({
          erc20: asset,
          owner: referralFeeRecipient,
        });
        const initialNonce = await client.readContract({
          address: vault,
          abi: erc2612Abi,
          functionName: "nonces",
          args: [account],
        });
        const readClient = createPublicClient({
          chain: client.chain,
          transport: custom({ request: client.request }),
        });
        const pending = await prepareVaultV2Redeem(readClient, {
          shareToken: new Token({ address: vault }),
          chainId: client.chain.id,
          account,
          shares: amount,
          supportSignature,
          expiresAt,
          referralFee: { bps: 100, recipient: referralFeeRecipient },
          calldataOrigin: "0xcafe",
        });
        const needsPermit = !approved && supportSignature === true;
        expect(pending.steps.map(({ action }) => action.type)).toEqual(
          !approved && !needsPermit
            ? ["erc20Approval", "vaultV2Redeem"]
            : ["vaultV2Redeem"],
        );
        expect(getPendingSignatureRequests(pending)).toHaveLength(
          needsPermit ? 1 : 0,
        );
        if (needsPermit) {
          expect(pending.signatureRequests).toMatchObject([
            {
              id: "vaultV2Redeem:tokenPermit",
              kind: "permit",
              args: { amount: maxUint256, spender },
              typedData: {
                domain: { chainId: client.chain.id, verifyingContract: vault },
              },
            },
          ]);
        } else {
          expect(pending.signatureRequests).toEqual([]);
        }
        // Build only from serialized data on a different client; no preparation closure survives.
        const restored = parseTransactionPlan(
          serializeTransactionPlan(pending),
        );
        const signatures = await Promise.all(
          getPendingSignatureRequests(restored).map(
            async ({ id, typedData }) => ({
              id,
              signature: await signTypedData(client, {
                ...typedData,
                account: client.account,
              }),
            }),
          ),
        );
        const signed = applySignatures(restored, signatures);
        const transactions = buildTransactions(
          parseTransactionPlan(serializeTransactionPlan(signed)),
        );
        expect(transactions).toEqual(buildTransactions(signed));
        const legacySignature = needsPermit
          ? await encodeVaultSharesPermit({
              vault: new Token({ address: vault }),
              version: "vaultV2",
              owner: account,
              chainId: client.chain.id,
              spender,
              nonce: initialNonce,
              deadline: BigInt(expiresAt),
            }).sign(client, account)
          : undefined;
        const expected = vaultV2Redeem({
          vault: { address: vault, chainId: client.chain.id },
          metadata: { origin: "0xcafe" },
          args: {
            shares: amount,
            userAddress: account,
            deadline: BigInt(expiresAt),
            referralFeePct,
            referralFeeRecipient,
            requirementSignature: legacySignature,
          },
        });
        const redemption = transactions.at(-1)!;
        expect(redemption).toMatchObject(expected);
        expect(redemption.to).toBe(spender);
        expect(redemption.data).toBe(expected.data);
        if (!approved && !needsPermit) {
          expect(transactions[0]).toMatchObject({
            to: vault,
            action: {
              type: "erc20Approval",
              args: { spender, amount: maxUint256 },
            },
          });
        }
        for (const transaction of transactions) {
          expect(transaction).not.toHaveProperty("id");
          expect(transaction).not.toHaveProperty("kind");
        }
        const grossAssets = await client.readContract({
          address: vault,
          abi: vaultV2Abi,
          functionName: "previewRedeem",
          args: [amount],
        });
        const fee = (grossAssets * referralFeePct) / MathLib.WAD;
        for (const transaction of transactions) {
          const hash = await client.sendTransaction(transaction);
          expect(
            (await client.waitForTransactionReceipt({ hash })).status,
          ).toBe("success");
        }
        expect(await client.balanceOf({ erc20: vault })).toBe(balance - amount);
        expect(await client.balanceOf({ erc20: asset })).toBe(
          initialAssets + grossAssets - fee,
        );
        expect(
          await client.balanceOf({ erc20: asset, owner: referralFeeRecipient }),
        ).toBe(initialFeeAssets + fee);
        expect(
          await client.readContract({
            address: vault,
            abi: erc2612Abi,
            functionName: "nonces",
            args: [account],
          }),
        ).toBe(initialNonce + (needsPermit ? 1n : 0n));
      },
    );
  },
);

test("behavior: address-only and accrued share tokens produce identical plans", async ({
  client,
}) => {
  const vaultData = await fetchAccrualVaultV2(
    KeyrockUsdcVaultV2.address,
    client,
    { deployless: false },
  );
  const params = {
    shareToken: new Token({ address: vaultData.address }),
    chainId: client.chain.id,
    account: client.account.address,
    shares: 1n,
    expiresAt: Number(Time.timestamp() + 7_200n),
  };
  expect(
    await prepareVaultV2Redeem(client, { ...params, shareToken: vaultData }),
  ).toEqual(await prepareVaultV2Redeem(client, params));
});

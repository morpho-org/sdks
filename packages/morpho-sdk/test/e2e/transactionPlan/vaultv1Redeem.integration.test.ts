import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { erc4626Abi, maxUint256, parseUnits } from "viem";
import { signTypedData } from "viem/actions";
import { describe, expect } from "vitest";
import { fetchToken } from "../../../src/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareVaultV1Redeem,
  serializeTransactionPlan,
  vaultV1Redeem,
} from "../../../src/index.js";
import { getVaultPermit } from "../../../src/transactionPlan/permit.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

const vault = SteakhouseUsdcVaultV1.address;
const asset = SteakhouseUsdcVaultV1.asset;
const spender = getChainAddress(1, "bundles.vaultBundlesV1");

describe("Vault V1 redeem plans at mainnet block 25,730,000", () => {
  for (const fullBalance of [false, true]) {
    test.for([
      { branch: "existing allowance", supportSignature: false },
      { branch: "existing allowance", supportSignature: true },
      { branch: "direct approval", supportSignature: false },
      { branch: "share permit", supportSignature: true },
    ] as const)(
      `${fullBalance ? "full" : "partial"} redemption through $branch ($supportSignature)`,
      async ({ branch, supportSignature }, { client }) => {
        const account = client.account.address;
        const depositAssets = parseUnits("10", 6);
        await client.deal({ erc20: asset, amount: depositAssets });
        await client.approve({ address: asset, args: [vault, maxUint256] });
        await client.writeContract({
          address: vault,
          abi: erc4626Abi,
          functionName: "deposit",
          args: [depositAssets, account],
        });
        const initialShares = await client.balanceOf({ erc20: vault });
        const amount = fullBalance ? initialShares : initialShares / 2n;
        expect(amount).toBeGreaterThan(0n);
        if (branch === "existing allowance")
          await client.approve({ address: vault, args: [spender, amount] });
        else
          await client.approve({
            address: vault,
            args: [getChainAddress(1, "permit2"), maxUint256],
          });

        const expiresAt = Number(Time.timestamp() + Time.s.from.h(2n));
        const intent = {
          chainId: client.chain.id,
          account,
          shares: amount,
          expiresAt,
          shareToken: await fetchToken(vault, client),
        };
        let plan = await prepareVaultV1Redeem(client, {
          ...intent,
          supportSignature,
        });
        if (branch === "existing allowance") {
          expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Redeem"]);
          expect(getPendingSignatureRequests(plan)).toEqual([]);
          expect(plan.signatureRequests).toEqual([]);
        } else if (branch === "direct approval") {
          expect(plan.steps[0]?.action).toEqual({
            type: "erc20Approval",
            inputs: {
              token: vault,
              spender,
              shares: maxUint256,
              chainId: client.chain.id,
              account,
            },
          });
          expect(plan.signatureRequests).toEqual([]);
        } else {
          expect(plan.steps.map(({ id }) => id)).toEqual(["vaultV1Redeem"]);
          expect(plan.signatureRequests).toMatchObject([
            {
              id: "vaultV1Redeem:tokenPermit",
              kind: "permit",
              args: { amount: maxUint256, spender },
            },
          ]);
        }

        const signatures = await Promise.all(
          getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
            id,
            signature: await signTypedData(client, {
              ...typedData,
              account: client.account,
            }),
          })),
        );
        plan = applySignatures(plan, signatures);
        const restored = parseTransactionPlan(serializeTransactionPlan(plan));
        const transactions = buildTransactions(restored);
        expect(transactions).toEqual(buildTransactions(plan));
        const signature = getVaultPermit(restored.signatureRequests, {
          id: plan.signatureRequests[0]?.id,
          asset: vault,
          owner: account,
        });
        const legacy = vaultV1Redeem({
          vault: { address: vault, chainId: client.chain.id },
          args: {
            shares: amount,
            userAddress: account,
            deadline: BigInt(expiresAt),
            requirementSignature: signature,
          },
        });
        const redemption = transactions.at(-1)!;
        expect(redemption).toMatchObject({
          to: legacy.to,
          data: legacy.data,
          value: legacy.value,
        });
        expect(redemption.to).toBe(spender);
        expect(plan.steps.map(({ action }) => action.type)).toEqual(
          branch === "direct approval"
            ? ["erc20Approval", "vaultV1Redeem"]
            : ["vaultV1Redeem"],
        );
        expect(
          plan.signatureRequests.every(
            ({ kind, args }) => kind === "permit" && args.spender === spender,
          ),
        ).toBe(true);

        const expectedAssets = await client.readContract({
          address: vault,
          abi: erc4626Abi,
          functionName: "previewRedeem",
          args: [amount],
        });
        const initialAssets = await client.balanceOf({ erc20: asset });
        for (const transaction of transactions) {
          const hash = await client.sendTransaction(transaction);
          expect(
            (await client.waitForTransactionReceipt({ hash })).status,
          ).toBe("success");
        }
        expect(await client.balanceOf({ erc20: vault })).toBe(
          initialShares - amount,
        );
        expect(await client.balanceOf({ erc20: asset })).toBe(
          initialAssets + expectedAssets,
        );
      },
    );
  }
});

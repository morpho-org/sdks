import { getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { concatHex, maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { assert, expect } from "vitest";
import {
  type BlueSupplyParams,
  blueSupply,
} from "../src/actions/blue/supply.js";
import { fetchAccrualPosition, fetchMarket } from "../src/blue/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  NativeAmountOnNonWNativeAssetError,
  parseTransactionPlan,
  prepareBlueSupply,
  serializeTransactionPlan,
} from "../src/index.js";
import { CbbtcUsdcBlue, WstethWethBlue } from "./fixtures/blue.js";
import { seedDeadSupply } from "./helpers/blue.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 25_832_676n,
});

for (const mode of ["allowance", "approval", "permit", "native"] as const) {
  test(`supply plan lifecycle: ${mode}`, async ({ client }) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    const marketParams = mode === "native" ? WstethWethBlue : CbbtcUsdcBlue;
    const assets = parseUnits("1", mode === "native" ? 18 : 6);
    const spender = getChainAddress(1, "bundles.blueBundlesV1");
    await seedDeadSupply({ client, chainId: 1, market: marketParams });
    await client.deal({
      erc20: marketParams.loanToken,
      amount: mode === "native" ? 0n : assets,
    });
    await client.approve({
      address: marketParams.loanToken,
      args: [spender, mode === "allowance" ? maxUint256 : 0n],
    });
    const snapshot = await fetchMarket(marketParams.id, client);
    const before = await fetchAccrualPosition(
      client.account.address,
      marketParams.id,
      client,
    );
    const nativeBefore = await client.getBalance({
      address: client.account.address,
    });
    const now = (await client.getBlock()).timestamp;
    const deadline = now + 1200n;
    const recipient = "0x0000000000000000000000000000000000000002";
    const recipientBefore = await client.balanceOf({
      erc20: marketParams.loanToken,
      owner: recipient,
    });
    const calldataOrigin = "0xcafe";
    const plan = await prepareBlueSupply(client, {
      chainId: 1,
      account: client.account.address,
      marketId: snapshot.id,
      marketData: { chainId: 1, market: snapshot },
      assets,
      funding: { type: mode === "native" ? "native" : "erc20" },
      supportSignature: mode === "permit",
      now,
      expiresAt: Number(deadline),
      calldataOrigin,
      referralFee: { bps: 100, recipient },
    });
    expect(plan.steps.map((step) => step.action.type)).toEqual(
      mode === "approval" ? ["erc20Approval", "blueSupply"] : ["blueSupply"],
    );
    expect(plan.signatureRequests.map((request) => request.kind)).toEqual(
      mode === "permit" ? ["permit"] : [],
    );
    if (mode === "approval") {
      const approval = plan.steps[0]?.action;
      assert(approval?.type === "erc20Approval");
      expect(approval.inputs.assets).toBe(maxUint256);
      expect(approval.inputs.spender).toBe(spender);
    }
    for (const request of plan.signatureRequests) {
      assert(request.kind === "permit");
      expect(request.args.spender).toBe(spender);
    }
    const signed = applySignatures(
      plan,
      await Promise.all(
        getPendingSignatureRequests(plan).map(async (request) => ({
          id: request.id,
          signature: await client.signTypedData(request.typedData),
        })),
      ),
    );
    const restored = parseTransactionPlan(serializeTransactionPlan(signed));
    const supply = restored.steps.at(-1)?.action;
    assert(supply?.type === "blueSupply");
    expect(supply.inputs.nativeAssets).toBe(
      mode === "native" ? assets : undefined,
    );
    const built = buildTransactions(restored);
    expect(built).toEqual(buildTransactions(signed));
    const permit = signed.signatureRequests[0];
    let requirementSignature: BlueSupplyParams["args"]["requirementSignature"];
    if (permit !== undefined) {
      assert(permit.kind === "permit");
      assert(permit.signature !== undefined);
      requirementSignature = {
        action: {
          type: permit.kind,
          args: permit.args,
          typedData: permit.typedData,
        },
        args: {
          owner: client.account.address,
          asset: marketParams.loanToken,
          amount: permit.args.amount,
          nonce: permit.args.nonce,
          deadline: permit.args.deadline,
          signature: permit.signature,
        },
      };
    }
    const expected = blueSupply({
      market: { chainId: 1, marketParams },
      args: {
        userAddress: client.account.address,
        assets,
        nativeAmount: mode === "native" ? assets : undefined,
        deadline,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: recipient,
        requirementSignature,
      },
    });
    expect(built.at(-1)?.to).toBe(spender);
    expect(built.at(-1)?.data).toBe(concatHex([expected.data, calldataOrigin]));
    expect(built.at(-1)?.value).toBe(mode === "native" ? assets : 0n);
    expect(built.at(-1)?.value).toBe(expected.value);
    let gasCost = 0n;
    for (const tx of built) {
      const hash = await client.sendTransaction(tx);
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      gasCost += receipt.gasUsed * receipt.effectiveGasPrice;
    }
    const after = await fetchAccrualPosition(
      client.account.address,
      marketParams.id,
      client,
    );
    expect(after.supplyShares).toBeGreaterThan(before.supplyShares);
    expect(after.supplyAssets - before.supplyAssets).toBeGreaterThanOrEqual(
      (assets * 99n) / 100n - 1n,
    );
    expect(
      await client.balanceOf({
        erc20: marketParams.loanToken,
        owner: client.account.address,
      }),
    ).toBe(0n);
    expect(
      await client.balanceOf({
        erc20: marketParams.loanToken,
        owner: recipient,
      }),
    ).toBe(recipientBefore + assets / 100n);
    if (mode === "native") {
      expect(await client.getBalance({ address: client.account.address })).toBe(
        nativeBefore - assets - gasCost,
      );
    }
  });
}

test("rejects native funding of a non-wNative loan token", async ({
  client,
}) => {
  const snapshot = await fetchMarket(CbbtcUsdcBlue.id, client);
  await expect(
    prepareBlueSupply(client, {
      chainId: 1,
      account: client.account.address,
      assets: 1n,
      marketId: snapshot.id,
      marketData: { chainId: 1, market: snapshot },
      funding: { type: "native" },
      now: (await client.getBlock()).timestamp,
    }),
  ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
});

import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { erc4626Abi, parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareVaultV2ForceRedeem,
  serializeTransactionPlan,
  vaultV2ForceRedeem,
} from "../../../src/index.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";
import { setUpSingleAdapterVaultV2 } from "../../helpers/vaultV2.js";
import { createE2eMarket } from "../setup.js";

describe("TransactionPlan forceRedeem at mainnet block 25,730,000", () => {
  test("force-redeems illiquid shares without approvals or signatures", async ({
    client,
  }) => {
    const market = await createE2eMarket(client, client.chain.id);
    const depositAssets = parseEther("10");
    const allocatedAssets = parseEther("6");
    const penalty = parseUnits("0.01", 18);
    const { vault, adapter, depositAndAllocate } =
      await setUpSingleAdapterVaultV2(client, {
        asset: market.loanToken,
        markets: [market],
        forceDeallocatePenalty: penalty,
      });
    await depositAndAllocate({
      assets: depositAssets,
      perMarket: [{ market, assets: allocatedAssets }],
    });
    const shares = await client.balanceOf({ erc20: vault });
    const penaltyAssets = MathLib.mulDivUp(
      allocatedAssets,
      penalty,
      MathLib.WAD,
    );
    const penaltyShares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewWithdraw",
      args: [penaltyAssets],
    });
    const redeem = { shares: shares - penaltyShares };
    const deallocations = [
      { adapter, marketParams: market, assets: allocatedAssets },
    ];
    const idle = await client.balanceOf({
      erc20: market.loanToken,
      owner: vault,
    });
    expect(idle).toBe(depositAssets - allocatedAssets);
    expect(idle).toBeLessThan(depositAssets - penaltyAssets);
    const initialAssets = await client.balanceOf({ erc20: market.loanToken });
    let plan = await prepareVaultV2ForceRedeem(client, {
      vaultAddress: vault,
      chainId: client.chain.id,
      account: client.account.address,
      shares: redeem.shares,
      deallocations,
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toEqual({
      type: "vaultV2ForceRedeem",
      inputs: {
        chainId: client.chain.id,
        account: client.account.address,
        vault,
        redeem,
        deallocations: [
          {
            adapter,
            assets: allocatedAssets,
            marketParams: {
              loanToken: market.loanToken,
              collateralToken: market.collateralToken,
              oracle: market.oracle,
              irm: market.irm,
              lltv: market.lltv,
            },
          },
        ],
      },
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(getPendingSignatureRequests(plan)).toEqual([]);
    plan = applySignatures(plan, []);
    plan = parseTransactionPlan(serializeTransactionPlan(plan));
    const [transaction] = buildTransactions(plan);
    if (!transaction) throw new Error("Expected the force-redeem transaction");
    const expected = vaultV2ForceRedeem({
      vault: { address: vault },
      args: {
        deallocations: deallocations.map(
          ({ assets, marketParams, ...deallocation }) => ({
            ...deallocation,
            ...(marketParams && {
              marketParams: new MarketParams(marketParams),
            }),
            amount: assets,
          }),
        ),
        redeem: { ...redeem, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });
    expect(transaction.to).toBe(vault);
    expect(transaction.data).toBe(expected.data);
    const hash = await client.sendTransaction(transaction);
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
      "success",
    );
    expect(await client.balanceOf({ erc20: vault })).toBe(0n);
    expect(await client.balanceOf({ erc20: market.loanToken })).toBe(
      initialAssets + depositAssets - penaltyAssets,
    );
    expect(
      await client.balanceOf({ erc20: market.loanToken, owner: vault }),
    ).toBe(penaltyAssets);
  });
});

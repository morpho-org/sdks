import {
  getChainAddresses,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { E2eScenario } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  erc4626Abi,
  parseEther,
  parseUnits,
} from "viem";
import { expect } from "vitest";
import {
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
} from "../../src/index.js";
import { satisfyBlueBundlesV1Requirements } from "../helpers/blueBundlesV1.js";
import { setUpSingleAdapterVaultV2 } from "../helpers/vaultV2.js";
import { createE2eMarket, describeE2e, wrapE2eNative } from "./setup.js";

const scenario: E2eScenario = {
  name: "vaultV2",
  requires: [
    "blue",
    "adaptiveCurveIrm",
    "vaultV2Factory",
    "morphoMarketV1AdapterV2Factory",
    "bundles.vaultBundlesV1",
  ],
};

const depositAssets = parseEther("10");
const allocatedAssets = parseEther("6");
const forceDeallocatePenalty = parseUnits("0.01", 18);

/**
 * Deploys a Vault V2 over a fresh market and deposits `depositAssets`, `allocatedAssets`
 * of which sit in the market. With `liquidityAdapter`, the vault pulls missing withdraw liquidity
 * from that market. `forceDeallocatePenalty` sets the adapter's force-deallocation penalty.
 */
const setUpVault = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly liquidityAdapter: boolean;
    readonly forceDeallocatePenalty?: bigint;
  },
) => {
  const market = await createE2eMarket(client, params.chainId);
  const { vault, adapter, depositAndAllocate } =
    await setUpSingleAdapterVaultV2(client, {
      asset: market.loanToken,
      markets: [market],
      liquidityMarket: params.liquidityAdapter ? market : undefined,
      forceDeallocatePenalty: params.forceDeallocatePenalty,
    });
  await depositAndAllocate({
    assets: depositAssets,
    perMarket: [{ market, assets: allocatedAssets }],
  });
  const shares = await client.balanceOf({ erc20: vault });

  return { market, vault, adapter, shares };
};

const getState = async (
  client: AnvilTestClient<Chain>,
  params: { readonly vault: Address; readonly market: MarketParams },
) => {
  const { blue } = getChainAddresses(client.chain.id);

  return {
    userAssets: await client.balanceOf({ erc20: params.market.loanToken }),
    userShares: await client.balanceOf({ erc20: params.vault }),
    vaultIdle: await client.balanceOf({
      erc20: params.market.loanToken,
      owner: params.vault,
    }),
    blueAssets: await client.balanceOf({
      erc20: params.market.loanToken,
      owner: blue,
    }),
    totalAssets: await client.readContract({
      address: params.vault,
      abi: erc4626Abi,
      functionName: "totalAssets",
    }),
  };
};

describeE2e(scenario, (test, { chainId }) => {
  test("deposit: approves and deposits the market asset through VaultBundlesV1", async ({
    client,
  }) => {
    const { market, vault, shares } = await setUpVault(client, {
      chainId,
      liquidityAdapter: false,
    });
    const assets = parseEther("1");
    await wrapE2eNative(client, { wNative: market.loanToken, amount: assets });
    const vaultV2 = client
      .extend(morphoViemExtension())
      .morpho.vaultV2(vault, chainId);
    const before = await getState(client, { vault, market });

    const deposit = vaultV2.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData: await vaultV2.getData(),
    });
    const requirements = await deposit.getRequirements();
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    await client.sendTransaction(deposit.buildTx());

    const after = await getState(client, { vault, market });
    expect(after.userAssets).toBe(0n);
    expect(after.vaultIdle).toBe(before.vaultIdle + assets);
    // A 1:1 share price on a fresh vault mints shares pro rata to the setup deposit.
    expect(after.userShares - before.userShares).toBe(
      (shares * assets) / depositAssets,
    );
  });

  test("withdraw: approves vault shares and withdraws from idle liquidity", async ({
    client,
  }) => {
    const { market, vault } = await setUpVault(client, {
      chainId,
      liquidityAdapter: false,
    });
    const assets = parseEther("1");
    const vaultV2 = client
      .extend(morphoViemExtension())
      .morpho.vaultV2(vault, chainId);
    const before = await getState(client, { vault, market });
    const withdrawnShares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewWithdraw",
      args: [assets],
    });

    const withdraw = vaultV2.withdraw({
      amount: assets,
      userAddress: client.account.address,
      vaultData: await vaultV2.getData(),
    });
    const requirements = await withdraw.getRequirements();
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    await client.sendTransaction(withdraw.buildTx());

    const after = await getState(client, { vault, market });
    expect(after.userAssets).toBe(before.userAssets + assets);
    expect(after.vaultIdle).toBe(before.vaultIdle - assets);
    expect(after.blueAssets).toBe(before.blueAssets);
    expect(after.userShares).toBe(before.userShares - withdrawnShares);
  });

  test("withdraw: signs a shares permit and pulls liquidity from the market through the liquidity adapter", async ({
    client,
  }) => {
    const { market, vault } = await setUpVault(client, {
      chainId,
      liquidityAdapter: true,
    });
    // More than the vault's idle assets, so the remainder is deallocated from the market.
    const assets = parseEther("7");
    const vaultV2 = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV2(vault, chainId);
    const before = await getState(client, { vault, market });
    // Deallocating leaves totalAssets unchanged, so the preview holds across the withdraw.
    const withdrawnShares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewWithdraw",
      args: [assets],
    });

    const withdraw = vaultV2.withdraw({
      amount: assets,
      userAddress: client.account.address,
      vaultData: await vaultV2.getData(),
    });
    const requirements = await withdraw.getRequirements();
    expect(requirements.map(isRequirementSignature)).toStrictEqual([true]);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(withdraw.buildTx(signatures));

    const after = await getState(client, { vault, market });
    expect(after.userAssets).toBe(before.userAssets + assets);
    expect(after.vaultIdle).toBe(0n);
    expect(after.blueAssets).toBe(
      before.blueAssets - (assets - before.vaultIdle),
    );
    expect(after.userShares).toBe(before.userShares - withdrawnShares);
  });

  test("redeem: approves vault shares and redeems them from idle liquidity", async ({
    client,
  }) => {
    const { market, vault, shares } = await setUpVault(client, {
      chainId,
      liquidityAdapter: false,
    });
    const redeemShares = shares / 10n;
    const vaultV2 = client
      .extend(morphoViemExtension())
      .morpho.vaultV2(vault, chainId);
    const before = await getState(client, { vault, market });

    const redeem = vaultV2.redeem({
      shares: redeemShares,
      userAddress: client.account.address,
    });
    const requirements = await redeem.getRequirements();
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    await client.sendTransaction(redeem.buildTx());

    const after = await getState(client, { vault, market });
    expect(after.userShares).toBe(before.userShares - redeemShares);
    expect(after.userAssets).toBe(before.vaultIdle - after.vaultIdle);
    expect(after.userAssets).toBe(depositAssets / 10n);
  });

  test("redeem: force-deallocates the market position under a penalty, then redeems the remaining shares", async ({
    client,
  }) => {
    const { market, vault, adapter, shares } = await setUpVault(client, {
      chainId,
      liquidityAdapter: false,
      forceDeallocatePenalty,
    });
    const vaultV2 = client
      .extend(morphoViemExtension())
      .morpho.vaultV2(vault, chainId);
    const before = await getState(client, { vault, market });
    // forceDeallocate withdraws the penalty from the user's position into the vault before the redeem.
    const penaltyAssets = MathLib.mulDivUp(
      allocatedAssets,
      forceDeallocatePenalty,
      MathLib.WAD,
    );
    const penaltyShares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewWithdraw",
      args: [penaltyAssets],
    });

    // Idle assets alone cannot cover a full redeem; the deallocation frees the rest.
    await client.sendTransaction(
      vaultV2
        .forceRedeem({
          deallocations: [
            { adapter, marketParams: market, amount: allocatedAssets },
          ],
          redeem: { shares: shares - penaltyShares },
          userAddress: client.account.address,
        })
        .buildTx(),
    );

    const after = await getState(client, { vault, market });
    expect(after.userShares).toBe(0n);
    expect(after.userAssets).toBe(depositAssets - penaltyAssets);
    expect(after.blueAssets).toBe(before.blueAssets - allocatedAssets);
    // The withdrawn penalty stays in the vault as an uncounted donation.
    expect(after.vaultIdle).toBe(penaltyAssets);
    expect(after.totalAssets).toBe(0n);
  });
});

import { getChainAddresses, MathLib } from "@morpho-org/blue-sdk";
import type { E2eScenario } from "@morpho-org/morpho-test";
import { parseEther, parseUnits } from "viem";
import { expect } from "vitest";
import {
  isRequirementApproval,
  morphoViemExtension,
  previewVaultV2ForceWithdraw,
} from "../../src/index.js";
import { satisfyBlueBundlesV1Requirements } from "../helpers/blueBundlesV1.js";
import { withChainTimestamp } from "../helpers/time.js";
import { setUpSingleAdapterVaultV2 } from "../helpers/vaultV2.js";
import { createE2eMarket, describeE2e } from "./setup.js";

const scenario: E2eScenario = {
  name: "vaultExit",
  requires: [
    "blue",
    "adaptiveCurveIrm",
    "vaultV2Factory",
    "morphoMarketV1AdapterV2Factory",
    "bundles.vaultExitBundlesV1",
  ],
};

const depositAssets = parseEther("10");
const exitAssets = parseEther("4");
const forceDeallocatePenalty = parseUnits("0.01", 18);

describeE2e(scenario, (test, { chainId }) => {
  test("forceWithdraw: exits an illiquid vault into the underlying asset", async ({
    client,
  }) => {
    // Fully allocated, illiquid Vault V2 with a 1% force-deallocate penalty.
    const market = await createE2eMarket(client, chainId);
    const { vault, depositAndAllocate } = await setUpSingleAdapterVaultV2(
      client,
      {
        asset: market.loanToken,
        markets: [market],
        forceDeallocatePenalty,
      },
    );
    await depositAndAllocate({
      assets: depositAssets,
      perMarket: [{ market, assets: depositAssets }],
    });
    const vaultV2 = client
      .extend(morphoViemExtension())
      .morpho.vaultV2(vault, chainId);
    const vaultData = await vaultV2.getData();
    const timestamp = await client.timestamp();
    const preview = previewVaultV2ForceWithdraw(vaultData, {
      requestedExitAssets: exitAssets,
      timestamp,
    });
    if (preview == null) throw new Error("Expected an exitable vault");
    const sharesBefore = await client.balanceOf({ erc20: vault });

    const exit = withChainTimestamp(timestamp, () =>
      vaultV2.forceWithdraw({
        exitAssets,
        vaultData,
        userAddress: client.account.address,
      }),
    );
    const requirements = await withChainTimestamp(timestamp, () =>
      exit.getRequirements(),
    );
    expect(requirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, { requirements });
    await client.sendTransaction(exit.buildTx());

    expect(await client.balanceOf({ erc20: market.loanToken })).toBe(
      preview.netAssets,
    );
    expect(preview.netAssets).toBeLessThan(exitAssets);
    expect(sharesBefore - (await client.balanceOf({ erc20: vault }))).toBe(
      vaultData.toShares(preview.exitAssets, "Up"),
    );
  });

  test("inKindRedeem: exits an illiquid vault into a Blue supply position", async ({
    client,
  }) => {
    // Fully allocated, illiquid Vault V2 with a 1% force-deallocate penalty.
    const market = await createE2eMarket(client, chainId);
    const { vault, depositAndAllocate } = await setUpSingleAdapterVaultV2(
      client,
      {
        asset: market.loanToken,
        markets: [market],
        forceDeallocatePenalty,
      },
    );
    await depositAndAllocate({
      assets: depositAssets,
      perMarket: [{ market, assets: depositAssets }],
    });
    const vaultV2 = client
      .extend(morphoViemExtension())
      .morpho.vaultV2(vault, chainId);
    const { blue } = getChainAddresses(chainId);
    const blueEntity = client
      .extend(morphoViemExtension())
      .morpho.blue(market, chainId);
    const sharesBefore = await client.balanceOf({ erc20: vault });
    const blueBefore = await client.balanceOf({
      erc20: market.loanToken,
      owner: blue,
    });

    const vaultData = await vaultV2.getData();
    const exit = vaultV2.inKindRedeem({
      amount: exitAssets,
      marketParamsList: [market],
      vaultData,
      userAddress: client.account.address,
    });
    await satisfyBlueBundlesV1Requirements(client, {
      requirements: await exit.getRequirements(),
    });
    await client.sendTransaction(exit.buildTx());

    const position = await blueEntity.getPositionData(client.account.address);
    // `exitAssets` is penalty-inclusive: the 1% penalty is withheld and the rest becomes the user's
    // Blue supply, which Blue's share conversion rounds down by at most one wei.
    const netAssets =
      (exitAssets * MathLib.WAD) / (MathLib.WAD + forceDeallocatePenalty);
    expect(position.supplyAssets).toBeLessThanOrEqual(netAssets);
    expect(position.supplyAssets).toBeGreaterThanOrEqual(netAssets - 1n);
    expect(sharesBefore - (await client.balanceOf({ erc20: vault }))).toBe(
      vaultData.toShares(exitAssets, "Up"),
    );
    // Assets move between positions inside Blue rather than leaving it.
    expect(
      await client.balanceOf({ erc20: market.loanToken, owner: blue }),
    ).toBe(blueBefore);
  });
});

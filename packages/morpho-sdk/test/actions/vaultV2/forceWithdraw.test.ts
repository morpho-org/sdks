import { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { MorphoClient, vaultV2ForceWithdraw } from "../../../src/index.js";
import { ReEcosystemUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("ForceWithdraw VaultV2", () => {
  // MarketV1 adapter addresses
  const adapterAddress1: Address = "0xBf3a9504d555752ae12d2c482E957C66C4A32131";
  const marketParams = new MarketParams({
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    collateralToken: "0x5086bf358635B81D8C47C66d1C8b9E567Db70c72",
    oracle: "0xA66a4F03Fd8031973f8C7718904ce32385f54E70",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: parseUnits("0.915", 18),
  });

  // vault v1 adapter address
  const adapterAddress2: Address = "0xeD7666CaB7e41b10c39EBA501e906d2d6a58BdBE";
  const underlyingAssetVaultV1Address = {
    address: "0xA1FF9C28Ebc160c1Dcde4b9aA9551f617880c6fb",
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  } as const;

  test("should create force withdraw transaction from adapter market V1", async ({
    client,
  }) => {
    const morpho = new MorphoClient(client);
    const initialAssetPosition = parseUnits("200", 6);
    const assetsDeallocate = parseUnits("100", 6);
    const assetsWithdraw = parseUnits("100", 6);

    const vaultV2 = morpho.vaultV2(ReEcosystemUsdcVaultV2.address, mainnet.id);

    const vaultV2Data = await vaultV2.getData();
    const share = vaultV2Data.toShares(initialAssetPosition);

    await client.deal({
      erc20: ReEcosystemUsdcVaultV2.address,
      amount: share,
    });

    const deallocations = [
      {
        adapter: adapterAddress1,
        marketParams,
        amount: assetsDeallocate,
      },
    ] as const;

    const forceWithdraw = vaultV2.forceWithdraw({
      deallocations,
      withdraw: { amount: assetsWithdraw },
      userAddress: client.account.address,
    });
    const tx_1 = forceWithdraw.buildTx();

    const tx_2 = vaultV2ForceWithdraw({
      vault: { address: ReEcosystemUsdcVaultV2.address },
      args: {
        deallocations,
        withdraw: { amount: assetsWithdraw, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });

    expect(tx_1).toStrictEqual(tx_2);

    const {
      vaults: {
        ReEcosystemUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { ReEcosystemUsdcVaultV2 },
      },
      actionFn: async () => {
        await client.sendTransaction(tx_1);
      },
    });

    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance - assetsDeallocate,
    );
    expect(finalState.vaultBalance).toEqual(
      initialState.vaultBalance + assetsDeallocate - assetsWithdraw,
    );
    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance + assetsWithdraw,
    );
  });

  test("should force withdraw transaction from adapter vault V1", async ({
    client,
  }) => {
    const morpho = new MorphoClient(client);
    // on the fork, this vault v1 has small allocation
    const initialAssetPosition = parseUnits("200", 6);
    const assets = 100n;

    const vaultV2 = morpho.vaultV2(ReEcosystemUsdcVaultV2.address, mainnet.id);

    const vaultV2Data = await vaultV2.getData();
    const share = vaultV2Data.toShares(initialAssetPosition);

    await client.deal({
      erc20: ReEcosystemUsdcVaultV2.address,
      amount: share,
    });

    const deallocations = [
      { adapter: adapterAddress2, amount: assets },
    ] as const;

    const forceWithdraw = vaultV2.forceWithdraw({
      deallocations,
      withdraw: { amount: assets },
      userAddress: client.account.address,
    });
    const tx = forceWithdraw.buildTx();

    const {
      vaults: {
        ReEcosystemUsdcVaultV2: { initialState, finalState },
        underlyingAssetVaultV1Address: {
          initialState: initialStateVaultV1,
          finalState: finalStateVaultV1,
        },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { ReEcosystemUsdcVaultV2, underlyingAssetVaultV1Address },
      },
      actionFn: async () => {
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance - assets,
    );
    expect(finalStateVaultV1.userAssetBalance).toEqual(
      initialStateVaultV1.userAssetBalance + assets,
    );
    expect(finalState.vaultBalance).toEqual(
      initialState.vaultBalance + assets - assets,
    );
    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance + assets,
    );
  });

  test("should force withdraw transaction with multiple deallocations", async ({
    client,
  }) => {
    const morpho = new MorphoClient(client);
    const assetsDeallocate1 = parseUnits("1", 6);
    const assetsDeallocate2 = 1n;
    const withdrawAssets = assetsDeallocate1 + assetsDeallocate2;

    const vaultV2 = morpho.vaultV2(ReEcosystemUsdcVaultV2.address, mainnet.id);

    const vaultV2Data = await vaultV2.getData();
    const share = vaultV2Data.toShares(withdrawAssets + withdrawAssets);

    await client.deal({
      erc20: ReEcosystemUsdcVaultV2.address,
      amount: share,
    });

    const deallocations = [
      {
        adapter: adapterAddress1,
        marketParams: marketParams,
        amount: assetsDeallocate1,
      },
      { adapter: adapterAddress2, amount: assetsDeallocate2 },
    ] as const;

    const forceWithdraw = vaultV2.forceWithdraw({
      deallocations,
      withdraw: { amount: withdrawAssets },
      userAddress: client.account.address,
    });
    const tx = forceWithdraw.buildTx();

    const {
      vaults: {
        ReEcosystemUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { ReEcosystemUsdcVaultV2, underlyingAssetVaultV1Address },
      },
      actionFn: async () => {
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance - assetsDeallocate1 - assetsDeallocate2,
    );
    expect(finalState.vaultBalance).toEqual(
      initialState.vaultBalance +
        (assetsDeallocate1 + assetsDeallocate2) -
        withdrawAssets,
    );
    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance + withdrawAssets,
    );
  });
});

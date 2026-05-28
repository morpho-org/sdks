import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";
import { testInvariants } from "../../../test/helpers/invariants.js";
import { test } from "../../../test/setup.js";
import { MorphoClient } from "../../index.js";

describe("Withdraw VaultV1", () => {
  test("should withdraw 1K assets in vaultV1", async ({ client }) => {
    const shares = parseUnits("1000", 18);
    const assets = parseUnits("1000", 6);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: shares,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const withdraw = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: assets,
        });
        const tx = withdraw.buildTx();

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userSharesBalance).toBeLessThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance + assets,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance - assets,
    );
  });

  test("should withdraw multiple times from vaultV1", async ({ client }) => {
    const shares = parseUnits("2000", 18);
    const firstWithdraw = parseUnits("500", 6);
    const secondWithdraw = parseUnits("300", 6);

    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: shares,
    });

    const {
      vaults: {
        SteakhouseUsdcVaultV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { SteakhouseUsdcVaultV1 },
      },
      actionFn: async () => {
        const morpho = new MorphoClient(client);
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );

        const withdraw1 = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: firstWithdraw,
        });
        await client.sendTransaction(withdraw1.buildTx());

        const withdraw2 = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: secondWithdraw,
        });
        await client.sendTransaction(withdraw2.buildTx());
      },
    });

    const totalWithdrawn = firstWithdraw + secondWithdraw;

    expect(finalState.userSharesBalance).toBeLessThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance + totalWithdrawn,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance - totalWithdrawn,
    );
  });
});

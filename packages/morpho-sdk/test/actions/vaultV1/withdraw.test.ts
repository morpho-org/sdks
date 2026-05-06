import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { MorphoClient, vaultV1Withdraw } from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("Withdraw VaultV1", () => {
  test("should create withdraw transaction", async ({ client }) => {
    const morpho = new MorphoClient(client);

    const withdraw = morpho
      .vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id)
      .withdraw({
        userAddress: client.account.address,
        amount: 1000000000000000000n,
      });
    const tx_1 = withdraw.buildTx();

    const tx_2 = vaultV1Withdraw({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        amount: 1000000000000000000n,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(withdraw).toBeDefined();
    expect(tx_1).toStrictEqual(tx_2);
  });

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

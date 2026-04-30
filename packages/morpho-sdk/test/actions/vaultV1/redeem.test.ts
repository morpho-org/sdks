import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MorphoClient,
  isRequirementApproval,
  vaultV1Redeem,
} from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("Redeem VaultV1", () => {
  test("should create redeem transaction", async ({ client }) => {
    const morpho = new MorphoClient(client);

    const redeem = morpho
      .vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id)
      .redeem({
        userAddress: client.account.address,
        shares: 1000000000000000000n,
      });
    const tx_1 = redeem.buildTx();

    const tx_2 = vaultV1Redeem({
      vault: {
        address: SteakhouseUsdcVaultV1.address,
      },
      args: {
        shares: 1000000000000000000n,
        recipient: client.account.address,
        onBehalf: client.account.address,
      },
    });

    expect(redeem).toBeDefined();
    expect(tx_1).toStrictEqual(tx_2);
  });

  test("should redeem 1K shares in vaultV1", async ({ client }) => {
    const shares = parseUnits("1000", 18);
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
        const redeem = vaultV1.redeem({
          userAddress: client.account.address,
          shares,
        });
        const tx = redeem.buildTx();

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userSharesBalance).toEqual(
      initialState.userSharesBalance - shares,
    );
    expect(finalState.userAssetBalance).toBeGreaterThan(
      initialState.userAssetBalance,
    );
    expect(finalState.morphoAssetBalance).toBeLessThan(
      initialState.morphoAssetBalance,
    );
    expect(finalState.userSharesBalance).toEqual(0n);
  });

  test("should deposit then redeem all shares in vaultV1", async ({
    client,
  }) => {
    const depositAmount = parseUnits("100", 6);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.asset,
      amount: depositAmount,
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

        const accrualVault = await vaultV1.getData();
        const deposit = vaultV1.deposit({
          userAddress: client.account.address,
          amount: depositAmount,
          accrualVault,
        });
        const requirements = await deposit.getRequirements();
        const approveTx = requirements[0];
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approveTx);
        await client.sendTransaction(deposit.buildTx());

        const shares = await client.balanceOf({
          erc20: SteakhouseUsdcVaultV1.address,
        });

        const redeem = vaultV1.redeem({
          userAddress: client.account.address,
          shares,
        });
        await client.sendTransaction(redeem.buildTx());
      },
    });

    expect(finalState.userSharesBalance).toEqual(
      initialState.userSharesBalance,
    );
    expect(finalState.userAssetBalance).toBeGreaterThanOrEqual(
      initialState.userAssetBalance,
    );
    expect(finalState.userAssetBalance).toBeLessThanOrEqual(
      initialState.userAssetBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toEqual(0n);
    expect(finalState.userAssetBalance).toEqual(depositAmount);
  });

  test("should redeem partial shares from vaultV1", async ({ client }) => {
    const totalShares = parseUnits("1000", 18);
    const redeemShares = parseUnits("400", 18);
    await client.deal({
      erc20: SteakhouseUsdcVaultV1.address,
      amount: totalShares,
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
        const redeem = vaultV1.redeem({
          userAddress: client.account.address,
          shares: redeemShares,
        });
        await client.sendTransaction(redeem.buildTx());
      },
    });

    expect(finalState.userSharesBalance).toEqual(
      initialState.userSharesBalance - redeemShares,
    );
    expect(finalState.userAssetBalance).toBeGreaterThan(
      initialState.userAssetBalance,
    );
    expect(finalState.morphoAssetBalance).toBeLessThan(
      initialState.morphoAssetBalance,
    );
  });
});

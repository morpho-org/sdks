import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementApproval,
  morphoViemExtension,
} from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

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
        const morpho = client.extend(morphoViemExtension()).morpho;
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );
        const withdraw = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: assets,
        });
        const requirements = await withdraw.getRequirements();
        expect(requirements).toHaveLength(1);
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approval);
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
        const morpho = client.extend(morphoViemExtension()).morpho;
        const vaultV1 = morpho.vaultV1(
          SteakhouseUsdcVaultV1.address,
          mainnet.id,
        );

        const withdraw1 = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: firstWithdraw,
        });
        const requirements1 = await withdraw1.getRequirements();
        expect(requirements1).toHaveLength(1);
        const approval1 = requirements1[0];
        if (!isRequirementApproval(approval1)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approval1);
        await client.sendTransaction(withdraw1.buildTx());

        const withdraw2 = vaultV1.withdraw({
          userAddress: client.account.address,
          amount: secondWithdraw,
        });
        const requirements2 = await withdraw2.getRequirements();
        expect(requirements2).toHaveLength(1);
        const approval2 = requirements2[0];
        if (!isRequirementApproval(approval2)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approval2);
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

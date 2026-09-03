import { MathLib } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  isRequirementApproval,
  morphoViemExtension,
} from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { KeyrockUsdcVaultV2 } from "../../fixtures/vaultV2.js";
import { testInvariants } from "../../helpers/invariants.js";
import { vaultBundlesV1Test as test } from "../../helpers/vaultBundlesV1.js";

describe("DepositVaultV2", () => {
  test("should deposit 1K USDC in vaultV2", async ({ client }) => {
    const amount = parseUnits("1000", 6);
    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount: amount,
    });

    const {
      vaults: {
        KeyrockUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const morpho = client.extend(morphoViemExtension()).morpho;
        const vaultV2 = morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const vaultData = await vaultV2.getData();
        const deposit = vaultV2.deposit({
          userAddress: client.account.address,
          amount: amount,
          vaultData,
        });

        const tx = deposit.buildTx();
        const requirements = await deposit.getRequirements();

        const approveTx = requirements[0];
        if (!approveTx) {
          throw new Error("Approve transaction not found");
        }
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction is not an approval transaction");
        }

        await client.sendTransaction(approveTx);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userAssetBalance).toEqual(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toEqual(
      initialState.morphoAssetBalance + amount,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
  });

  test("behavior: pays the exact referral fee and deposits only net assets", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    const referralFeePct = MathLib.WAD / 10n;
    const referralFeeAssets = MathLib.mulDivDown(
      amount,
      referralFeePct,
      MathLib.WAD,
    );
    const netAssets = amount - referralFeeAssets;
    const referralFeeRecipient = SteakhouseUsdcVaultV1.address;
    await client.deal({
      erc20: KeyrockUsdcVaultV2.asset,
      amount,
    });
    const initialReferralBalance = await client.balanceOf({
      erc20: KeyrockUsdcVaultV2.asset,
      owner: referralFeeRecipient,
    });

    const {
      vaults: {
        KeyrockUsdcVaultV2: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        vaults: { KeyrockUsdcVaultV2 },
      },
      actionFn: async () => {
        const vault = client
          .extend(morphoViemExtension())
          .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const vaultData = await vault.getData();
        const deposit = vault.deposit({
          userAddress: client.account.address,
          amount,
          vaultData,
          referralFeePct,
          referralFeeRecipient,
        });
        const requirements = await deposit.getRequirements();
        const approveTx = requirements[0];
        if (!isRequirementApproval(approveTx)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approveTx);
        await client.sendTransaction(deposit.buildTx());
      },
    });
    const finalReferralBalance = await client.balanceOf({
      erc20: KeyrockUsdcVaultV2.asset,
      owner: referralFeeRecipient,
    });

    expect(finalReferralBalance - initialReferralBalance).toBe(
      referralFeeAssets,
    );
    expect(finalState.userAssetBalance).toBe(
      initialState.userAssetBalance - amount,
    );
    expect(finalState.morphoAssetBalance).toBe(
      initialState.morphoAssetBalance + netAssets,
    );
    expect(finalState.userSharesBalance).toBeGreaterThan(
      initialState.userSharesBalance,
    );
    expect(finalState.userSharesBalanceInAssets).toBe(netAssets - 1n);
  });
});

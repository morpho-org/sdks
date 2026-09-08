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

describe("Redeem VaultV2", () => {
  test("should redeem 1K USDC in vaultV2", async ({ client }) => {
    const shares = parseUnits("1000", 18);
    await client.deal({
      erc20: KeyrockUsdcVaultV2.address,
      amount: shares,
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
        const redeem = vaultV2.redeem({
          userAddress: client.account.address,
          shares,
        });
        const requirements = await redeem.getRequirements();
        expect(requirements).toHaveLength(1);
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approval);
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
  });

  test("behavior: pays the exact referral fee and leaves the user the net proceeds", async ({
    client,
  }) => {
    const shares = parseUnits("1000", 18);
    const referralFeePct = MathLib.WAD / 10n;
    const referralFeeRecipient = SteakhouseUsdcVaultV1.address;
    await client.deal({
      erc20: KeyrockUsdcVaultV2.address,
      amount: shares,
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
        const vaultV2 = client
          .extend(morphoViemExtension())
          .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
        const redeem = vaultV2.redeem({
          userAddress: client.account.address,
          shares,
          referralFeePct,
          referralFeeRecipient,
        });
        const requirements = await redeem.getRequirements();
        expect(requirements).toHaveLength(1);
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approve transaction not found");
        }
        await client.sendTransaction(approval);
        await client.sendTransaction(redeem.buildTx());
      },
    });
    const finalReferralBalance = await client.balanceOf({
      erc20: KeyrockUsdcVaultV2.asset,
      owner: referralFeeRecipient,
    });

    // Assets leaving the vault and its Morpho supply positions are the gross redemption.
    const grossAssets =
      initialState.vaultBalance -
      finalState.vaultBalance +
      initialState.morphoAssetBalance -
      finalState.morphoAssetBalance;
    const referralFeeAssets = finalReferralBalance - initialReferralBalance;
    const netAssets =
      finalState.userAssetBalance - initialState.userAssetBalance;

    expect(finalState.userSharesBalance).toBe(
      initialState.userSharesBalance - shares,
    );
    expect(referralFeeAssets).toBeGreaterThan(0n);
    expect(referralFeeAssets).toBe(
      MathLib.mulDivDown(grossAssets, referralFeePct, MathLib.WAD),
    );
    expect(netAssets).toBe(grossAssets - referralFeeAssets);
  });
});

import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import {
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
} from "../../helpers/slippage.js";
import { ExcessiveSlippageToleranceError } from "../../types/index.js";
import { computeVaultV1MigrateToV2Quote } from "./migrateToV2Quote.js";

describe("computeVaultV1MigrateToV2Quote", () => {
  const now = 1_800_000_000n;
  const deadline = now + 7_200n;
  const referralFeePct = MathLib.WAD / 20n;
  const slippageTolerance = MathLib.WAD / 50n;

  test.each(["assets", "shares"] as const)(
    "quotes %s with a referral fee and custom slippage",
    (mode) => {
      const snapshotTimestamp = now + 120n;
      const sourceVault = withChainTimestamp(snapshotTimestamp, () =>
        inKindVaultV1Data({ fee: MathLib.WAD / 5n, lastTotalAssets: 900n }),
      );
      const targetVault = withChainTimestamp(now, () =>
        inKindVaultV2Data({ totalSupply: 777n }),
      );
      const amount = mode === "assets" ? { assets: 333n } : { shares: 399n };
      const grossAssets =
        mode === "assets"
          ? 333n
          : sourceVault
              .accrueInterest(snapshotTimestamp)
              .toAssets(399n, "Down");
      const netAssets =
        grossAssets - (grossAssets * referralFeePct) / MathLib.WAD;
      const quote = computeVaultV1MigrateToV2Quote({
        sourceVault,
        targetVault,
        ...amount,
        referralFeePct,
        slippageTolerance,
        deadline,
        now,
      });
      expect(quote).toEqual({
        maxSharePriceVaultV2: computeVaultMaxSharePrice({
          vaultData: targetVault,
          deadline,
          assets: netAssets,
          slippageTolerance,
        }),
        requiredShareAllowance:
          mode === "shares"
            ? 399n
            : computeVaultMaxShareAllowance({
                vaultData: sourceVault,
                deadline,
                assets: 333n,
                slippageTolerance,
              }),
      });
      expect(quote.maxSharePriceVaultV2).not.toBe(
        computeVaultMaxSharePrice({
          vaultData: targetVault,
          deadline,
          assets: grossAssets,
          slippageTolerance,
        }),
      );
      expect(quote.maxSharePriceVaultV2).not.toBe(
        computeVaultMaxSharePrice({
          vaultData: targetVault,
          deadline,
          assets: netAssets,
          slippageTolerance: 0n,
        }),
      );
      if (mode === "shares")
        expect(grossAssets).toBeLessThan(sourceVault.toAssets(399n, "Down"));
      expect(sourceVault.lastTotalAssets).toBe(900n);
      expect(targetVault.lastUpdate).toBe(now);
    },
  );

  test("propagates quote validation errors", () => {
    const sourceVault = withChainTimestamp(now, () => inKindVaultV1Data());
    const targetVault = withChainTimestamp(now, () => inKindVaultV2Data());
    expect(() =>
      computeVaultV1MigrateToV2Quote({
        sourceVault,
        targetVault,
        assets: 333n,
        referralFeePct,
        slippageTolerance: MathLib.WAD,
        deadline,
        now,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

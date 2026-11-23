import {
  type AccrualVault,
  type AccrualVaultV2,
  MathLib,
} from "@morpho-org/blue-sdk";
import { getBundlesReferralFeeAssets } from "../../actions/bundles/common.js";
import {
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
} from "../../helpers/slippage.js";
import type { VaultV1MigrateToV2AmountArgs } from "../../types/index.js";

/**
 * @internal Quotes a migration from validated snapshots and intent without reading chain state.
 * The source accrues interest and performance fees before a shares-mode conversion; the target
 * price bound uses assets net of the referral fee. Neither snapshot is mutated.
 * @param params - Source, target, exclusive amount, fee, slippage, deadline and preparation time.
 * @returns The destination maximum share price and minimum source share allowance.
 */
export function computeVaultV1MigrateToV2Quote(
  params: VaultV1MigrateToV2AmountArgs & {
    readonly sourceVault: AccrualVault;
    readonly targetVault: AccrualVaultV2;
    readonly referralFeePct: bigint;
    readonly slippageTolerance: bigint;
    readonly deadline: bigint;
    readonly now: bigint;
  },
): {
  readonly maxSharePriceVaultV2: bigint;
  readonly requiredShareAllowance: bigint;
} {
  const {
    sourceVault,
    targetVault,
    assets,
    shares,
    referralFeePct,
    slippageTolerance,
    deadline,
    now,
  } = params;
  const grossAssets =
    assets ??
    sourceVault
      .accrueInterest(
        sourceVault.allocations
          .values()
          .reduce(
            (timestamp, { position }) =>
              MathLib.max(timestamp, position.market.lastUpdate),
            now,
          ),
      )
      .toAssets(shares ?? 0n, "Down");
  const referralFeeAssets = getBundlesReferralFeeAssets(
    grossAssets,
    referralFeePct,
  );
  const maxSharePriceVaultV2 = computeVaultMaxSharePrice({
    vaultData: targetVault,
    deadline,
    assets: grossAssets - referralFeeAssets,
    slippageTolerance,
  });
  const requiredShareAllowance =
    shares ??
    computeVaultMaxShareAllowance({
      vaultData: sourceVault,
      deadline,
      assets: assets ?? 0n,
      slippageTolerance,
    });
  return { maxSharePriceVaultV2, requiredShareAllowance };
}

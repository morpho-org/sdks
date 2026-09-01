import {
  type AccrualVaultV2,
  type Address,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  computeVaultV2ForceWithdrawPlan,
  resolveVaultV2ForceWithdrawEligibility,
} from "./vaultV2ForceWithdrawPlan.js";

/** Inputs used to preview a Vault V2 force withdrawal. */
export interface PreviewVaultV2ForceWithdrawParams {
  /** Penalty-inclusive amount the user wants to exit. */
  readonly requestedExitAssets: bigint;
  /** Timestamp used to accrue every Morpho Blue market before converting adapter shares. */
  readonly timestamp: bigint;
  /** Optional adapter override; defaults to the vault's sole adapter. */
  readonly adapter?: Address;
  /** Optional WAD-scaled referral fee percentage. Defaults to `0n`. */
  readonly referralFeePct?: bigint;
}

/** Frontend-ready preview of a Vault V2 force withdrawal through VaultExitBundlesV1. */
export interface VaultV2ForceWithdrawPreview {
  /** Largest penalty-inclusive exit the current vault state supports. */
  readonly maxExitAssets: bigint;
  /** Penalty-inclusive exit amount this preview is computed for, capped at `maxExitAssets`. */
  readonly exitAssets: bigint;
  /** Requested penalty-inclusive amount left uncovered by `exitAssets`. */
  readonly remainingExitAssets: bigint;
  /** Portion withdrawn without a force-deallocation penalty (vault idle plus liquidity adapter). */
  readonly assetsToWithdraw: bigint;
  /** Portion force-deallocated from the adapter's markets, net of the penalty. */
  readonly assetsToDeallocate: bigint;
  /**
   * Lower-bound estimate of the assets charged as the force-deallocation penalty,
   * `ceil(assetsToDeallocate × penalty)`. Exact for a single-market exit. Across multiple markets
   * the contract charges `Σ ceil(chunkᵢ × penalty)`, which this order-independent plan cannot
   * reproduce without committing to the adapter's execution order (reordered mid-loop by
   * swap-and-pop); the true charge is at most `penaltyLegs − 1` wei higher. It is never the inflated
   * allowance bound. `netAssets` is exact and does not depend on this field, so the residual never
   * affects the quoted payout.
   */
  readonly penaltyAssets: bigint;
  /** Assets routed to the referral fee recipient. */
  readonly referralFeeAssets: bigint;
  /** Assets the user actually receives, net of penalty and referral fee. */
  readonly netAssets: bigint;
}

/**
 * Previews what a Vault V2 force withdrawal delivers, without any RPC.
 *
 * `exitAssets` is **penalty-inclusive**: the contract debits it from the user's position but pays
 * out only `assetsToWithdraw + assetsToDeallocate`. Use `netAssets` to quote what the user
 * receives and `maxExitAssets` to cap an input field.
 *
 * @param vaultData - Pre-fetched Vault V2 accrual snapshot.
 * @param params - Preview parameters.
 * @param params.requestedExitAssets - Penalty-inclusive amount the user wants to exit.
 * @param params.timestamp - Timestamp used to accrue Morpho Blue markets before computing capacity.
 *   Must not run ahead of the wall clock at the subsequent `forceWithdraw()` call: market accrual
 *   grows the adapter's position, so a forward timestamp reports a `maxExitAssets` the entity will
 *   reject.
 * @param params.adapter - Optional adapter override; defaults to the vault's sole adapter.
 * @param params.referralFeePct - Optional WAD-scaled referral fee percentage. Defaults to `0n`.
 * @returns The preview, or `undefined` when the exit is not previewable: not exactly one adapter, an
 *   `adapter` override that is not the vault's sole adapter, an adapter that is not a
 *   MorphoMarketV1AdapterV2, an unresolvable liquidity adapter, undecodable liquidity data, a
 *   `referralFeePct` outside `[0, WAD)`, a non-positive request, or a request that yields nothing.
 * @example
 * ```ts
 * import { previewVaultV2ForceWithdraw } from "@morpho-org/morpho-sdk";
 *
 * const preview = previewVaultV2ForceWithdraw(vaultData, {
 *   requestedExitAssets: 1_000_000n,
 *   timestamp: block.timestamp,
 * });
 * // preview?.exitAssets is ready to pass to vault.forceWithdraw(...)
 * // preview?.netAssets is what the user receives
 * ```
 */
export function previewVaultV2ForceWithdraw(
  vaultData: AccrualVaultV2,
  params: PreviewVaultV2ForceWithdrawParams,
): VaultV2ForceWithdrawPreview | undefined {
  const {
    requestedExitAssets,
    timestamp,
    adapter: adapterOverride,
    referralFeePct = 0n,
  } = params;
  if (requestedExitAssets <= 0n) return undefined;
  // Out of the range the action accepts, `netAssets` would quote a payout the contract can never
  // deliver — above `withdrawnAssets` for a negative fee, non-positive at or beyond WAD.
  if (referralFeePct < 0n || referralFeePct >= MathLib.WAD) return undefined;

  const eligibility = resolveVaultV2ForceWithdrawEligibility(
    vaultData,
    adapterOverride,
  );
  if (eligibility.type !== "eligible") return undefined;

  const capacity = computeVaultV2ForceWithdrawPlan({
    vaultData,
    adapter: eligibility.adapter,
    liquidityMarketId: eligibility.liquidityMarketId,
    exitAssets: requestedExitAssets,
    timestamp,
  });
  const exitAssets = MathLib.min(requestedExitAssets, capacity.maxExitAssets);
  // Re-plan at the capped amount so every returned leg describes the same exit.
  const plan =
    exitAssets === requestedExitAssets
      ? capacity
      : computeVaultV2ForceWithdrawPlan({
          vaultData,
          adapter: eligibility.adapter,
          liquidityMarketId: eligibility.liquidityMarketId,
          exitAssets,
          timestamp,
        });

  if (plan.withdrawnAssets <= 0n) return undefined;

  const referralFeeAssets = MathLib.mulDivDown(
    plan.withdrawnAssets,
    referralFeePct,
    MathLib.WAD,
  );

  return {
    maxExitAssets: capacity.maxExitAssets,
    exitAssets,
    remainingExitAssets: requestedExitAssets - exitAssets,
    assetsToWithdraw: plan.assetsToWithdraw,
    assetsToDeallocate: plan.assetsToDeallocate,
    // The tight per-leg charge `ceil(assetsToDeallocate × penalty)`, not `plan.penaltyAssets`: that
    // bound carries a `+ (penaltyLegs - 1)` allowance slack, which would overstate the quote and
    // break reconciliation with `exitAssets` for a multi-market exit.
    penaltyAssets: MathLib.wMulUp(plan.assetsToDeallocate, plan.penalty),
    referralFeeAssets,
    netAssets: plan.withdrawnAssets - referralFeeAssets,
  };
}

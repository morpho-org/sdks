import {
  type AccrualVaultV2,
  type Address,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  computeVaultV2ForceWithdrawFeeSharesMinted,
  computeVaultV2ForceWithdrawMinSharesBurnt,
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
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
  /**
   * Account that will call `forceWithdraw`; fee-recipient mints are mirrored when provided. The
   * entity projects the mints to its deadline; pass that as `feeProjectionTimestamp` to mirror it.
   */
  readonly userAddress?: Address;
  /**
   * Timestamp the fee-recipient mint guard is projected to; defaults to `timestamp`. Pass the
   * `forceWithdraw` deadline you will submit to mirror the entity's guard exactly. The entity
   * rejects deadlines more than one year after handle creation (`InputExceedsMaxError`) rather
   * than clamping them, so a quote projected past that horizon cannot be submitted. Ignored
   * without `userAddress`.
   */
  readonly feeProjectionTimestamp?: bigint;
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
 * @param params.userAddress - Optional account that will call `forceWithdraw`; when provided,
 *   fee shares minted to it by the accrual are mirrored exactly as the entity does. The entity
 *   projects the mints to its deadline; pass that as `feeProjectionTimestamp` to mirror it. Omit
 *   only for non-fee-recipient users.
 * @param params.feeProjectionTimestamp - Timestamp for the fee-recipient mint guard; defaults to
 *   `timestamp`. Pass the `forceWithdraw` deadline you will submit; the entity rejects deadlines
 *   more than one year after handle creation (`InputExceedsMaxError`) instead of clamping them, so
 *   keep the deadline itself within that horizon. Ignored without `userAddress`.
 * @param params.referralFeePct - Optional WAD-scaled referral fee percentage. Defaults to `0n`.
 * @returns The preview, or `undefined` when the exit is not previewable: not exactly one adapter, an
 *   `adapter` override that is not the vault's sole adapter, an adapter that is not a
 *   MorphoMarketV1AdapterV2, an unresolvable liquidity adapter, undecodable liquidity data, a
 *   `referralFeePct` outside `[0, WAD)`, a non-positive request, a request that yields nothing, a
 *   fee-recipient whose fee mints projected to `feeProjectionTimestamp` reach the lower burn bound,
 *   or an exit whose realized share price rounds down to zero at the default slippage tolerance
 *   (which the entity rejects with `VaultV2ForceWithdrawZeroSharePriceError`).
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
    userAddress,
    feeProjectionTimestamp = timestamp,
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
  // A vault with no exitable capacity caps `maxExitAssets` to `0`; the planner rejects a
  // non-positive amount, so short-circuit to the "not previewable" verdict before re-planning.
  if (exitAssets <= 0n) return undefined;
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

  // Mirror the entity's zero-floor guard. `forceWithdraw()` derives its slippage floor from
  // `withdrawnAssets / sharesBurnt` and rejects an exit whose realized share price rounds down to
  // zero (`VaultV2ForceWithdrawZeroSharePriceError`) — a degenerate vault (e.g. `totalSupply`
  // dwarfing `totalAssets`) offers no price protection at all. Screen at the entity's default
  // `DEFAULT_SLIPPAGE_TOLERANCE`, not slippage-free, against the same burn upper bound the entity
  // divides by (accrued to `timestamp` like the plan): a tolerance-free screen clears an exit whose
  // realized price is a single RAY-unit, yet the default tolerance scales that below 1 and rounds it
  // to zero — so the entity would reject with `VaultV2ForceWithdrawZeroSharePriceError` the very
  // `exitAssets` this preview handed back. A caller passing a larger tolerance still relies on the
  // entity's own guard.
  const { vault: accruedVaultData } = vaultData.accrueInterest(
    MathLib.max(timestamp, vaultData.lastUpdate),
  );
  const sharesBurnt = computeVaultV2ForceWithdrawSharesBurnt({
    vaultData: accruedVaultData,
    deadlineVaultData: accruedVaultData,
    plan,
  });
  const feeShares = userAddress
    ? computeVaultV2ForceWithdrawFeeSharesMinted({
        vaultData,
        owner: userAddress,
        timestamp,
      })
    : 0n;
  const effectiveFeeProjectionTimestamp = MathLib.max(
    timestamp,
    feeProjectionTimestamp,
  );
  if (userAddress) {
    const { vault: projectedVaultData } = vaultData.accrueInterest(
      MathLib.max(effectiveFeeProjectionTimestamp, vaultData.lastUpdate),
    );
    const feeSharesProjected = computeVaultV2ForceWithdrawFeeSharesMinted({
      vaultData,
      owner: userAddress,
      timestamp: effectiveFeeProjectionTimestamp,
    });
    const minSharesBurntProjected = computeVaultV2ForceWithdrawMinSharesBurnt({
      vaultData: projectedVaultData,
      plan,
    });
    if (feeSharesProjected >= minSharesBurntProjected) return undefined;
  }
  const sharesBurntForFloor = sharesBurnt - feeShares;
  if (
    sharesBurntForFloor <= 0n ||
    MathLib.mulDivDown(
      plan.withdrawnAssets,
      MathLib.wToRay(MathLib.WAD - DEFAULT_SLIPPAGE_TOLERANCE),
      sharesBurntForFloor,
    ) <= 0n
  ) {
    return undefined;
  }

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

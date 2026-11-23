import {
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
} from "@morpho-org/blue-sdk";
import { _try, Time } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import {
  computeMinForceWithdrawSharePrice,
  computeVaultV2ForceWithdrawFeeSharesMinted,
  computeVaultV2ForceWithdrawMinSharesBurnt,
  computeVaultV2ForceWithdrawPlan,
  computeVaultV2ForceWithdrawSharesBurnt,
  MAX_SLIPPAGE_TOLERANCE,
  resolveVaultV2ForceWithdrawEligibility,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import {
  validateDeadline,
  validateReferralFee,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  AdapterNotPartOfVaultError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NonPositiveInputError,
  VaultV2ForceWithdrawCoverageError,
  VaultV2ForceWithdrawFeeSharesExceedBurnError,
  VaultV2ForceWithdrawSharePriceBelowFloorError,
  VaultV2ForceWithdrawZeroSharePriceError,
  VaultV2ForceWithdrawZeroWithdrawalError,
  VaultV2SingleAdapterRequiredError,
  VaultV2UndecodableLiquidityDataError,
  VaultV2UnsupportedExitAdapterError,
  VaultV2UnsupportedLiquidityAdapterError,
} from "../../types/index.js";

const VAULT_V2_FEE_PROJECTION_HORIZON = Time.s.from.y(1n);

/** Resolves the supported adapter or reports the existing eligibility error. @internal */
function resolveForceWithdrawAdapter({
  vaultData,
  adapterOverride,
  vault,
}: {
  readonly vaultData: AccrualVaultV2;
  readonly adapterOverride: Address | undefined;
  readonly vault: Address;
}) {
  const eligibility = resolveVaultV2ForceWithdrawEligibility(
    vaultData,
    adapterOverride,
  );
  switch (eligibility.type) {
    case "eligible":
      return eligibility;
    case "adapterCount":
      throw new VaultV2SingleAdapterRequiredError(vault, eligibility.adapters);
    case "adapterMismatch":
      throw new AdapterNotPartOfVaultError(vault, eligibility.adapter);
    case "unsupportedAdapter":
      throw new VaultV2UnsupportedExitAdapterError(eligibility.adapter);
    case "unsupportedLiquidityAdapter":
      throw new VaultV2UnsupportedLiquidityAdapterError({
        vault: vault,
        liquidityAdapter: eligibility.liquidityAdapter,
        adapter: eligibility.adapter,
      });
    case "undecodableLiquidityData":
      throw new VaultV2UndecodableLiquidityDataError({
        vault: vault,
        liquidityAdapter: eligibility.liquidityAdapter,
        liquidityData: eligibility.liquidityData,
        cause: eligibility.cause,
      });
  }
}

/** Validates and resolves the quote's execution and fee-projection deadline. @internal */
function resolveForceWithdrawDeadline({
  deadlineOverride,
  now,
}: {
  readonly deadlineOverride: bigint | undefined;
  readonly now: bigint;
}) {
  const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
  // Reject the same bounds the action enforces, before `getRequirements()` can walk the caller
  // through a vault-share approval or an EIP-712 permit for a deadline `buildTx()` cannot encode.
  validateDeadline(deadline);
  if (deadline <= now) {
    throw new ExpiredDeadlineError(deadline, now);
  }
  const maxDeadline = now + VAULT_V2_FEE_PROJECTION_HORIZON;
  if (deadline > maxDeadline) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: deadline,
      max: maxDeadline,
    });
  }

  return deadline;
}

/**
 * @internal Computes the fixed exit quote from a snapshot without reads or signing.
 * @param params - Snapshot, caller intent and explicit quote timestamp.
 * @returns Fixed action fields and the minimum share allowance.
 */
export function computeVaultV2ForceWithdrawQuote({
  exitAssets,
  vaultData,
  userAddress,
  adapter: adapterOverride,
  deadline: deadlineOverride,
  slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
  minSharePriceE27: minSharePriceE27Override,
  referralFeePct = 0n,
  referralFeeRecipient,
  now,
  vault,
}: {
  readonly exitAssets: bigint;
  readonly vaultData: AccrualVaultV2;
  readonly userAddress: Address;
  readonly adapter?: Address;
  readonly deadline?: bigint;
  readonly slippageTolerance?: bigint;
  readonly minSharePriceE27?: bigint;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
  readonly now: bigint;
  readonly vault: Address;
}) {
  if (exitAssets <= 0n) {
    throw new NonPositiveInputError("exitAssets", exitAssets);
  }
  validateUint256Field("exitAssets", exitAssets);
  validateSlippageTolerance(slippageTolerance);
  // Called for its throws only: the raw pair is forwarded to the action, which normalizes it
  // again on the encode path so a direct action caller gets the same guarantees.
  validateReferralFee({ referralFeePct, referralFeeRecipient });
  if (minSharePriceE27Override != null) {
    // An unbounded override reopens the exact hole this path closes: the contract reads
    // `minSharePriceE27 == 0` as "no bound".
    if (minSharePriceE27Override <= 0n) {
      throw new NonPositiveInputError(
        "minSharePriceE27",
        minSharePriceE27Override,
      );
    }
    // And an override the uint256 slot cannot hold must fail here rather than after
    // `getRequirements()` has already asked for an approval or a permit signature.
    validateUint256Field("minSharePriceE27", minSharePriceE27Override);
  }

  const deadline = resolveForceWithdrawDeadline({ deadlineOverride, now });

  const eligibility = resolveForceWithdrawAdapter({
    vaultData,
    adapterOverride,
    vault,
  });

  const { adapter: accrualAdapter, liquidityMarketId } = eligibility;
  const adapter = accrualAdapter.address;
  const plan = computeVaultV2ForceWithdrawPlan({
    vaultData,
    adapter: accrualAdapter,
    liquidityMarketId,
    exitAssets,
    timestamp: now,
  });

  if (plan.withdrawnAssets <= 0n) {
    throw new VaultV2ForceWithdrawZeroWithdrawalError({
      vault: vault,
      exitAssets,
      penalty: plan.penalty,
    });
  }
  // The contract's force-deallocation loop is unbounded: under-coverage panics on-chain.
  if (plan.coveredAssets < plan.assetsToDeallocate) {
    throw new VaultV2ForceWithdrawCoverageError({
      required: plan.assetsToDeallocate,
      covered: plan.coveredAssets,
      maxExitAssets: plan.maxExitAssets,
    });
  }

  const projectionTimestamp = deadline;
  // VaultExitBundlesV1 measures shares as `sharesBefore - balanceAfter`; its first withdrawal
  // accrues the vault before burning. The realized price sits between the raw snapshot price
  // (pending fee mints not yet diluting it) and the `now` projection (interest the chain may not
  // have accrued yet, e.g. when the wall clock runs ahead of the chain). Price the floor off the
  // larger *net* burn of the two endpoints — the raw snapshot mints no fee shares, the `now`
  // accrual mints `feeSharesNow` — so it never exceeds either, and use the projected deadline
  // accrual for the fee-mint guard.
  const { vault: nowVaultData } = vaultData.accrueInterest(
    MathLib.max(now, vaultData.lastUpdate),
  );
  const { vault: projectedVaultData } = vaultData.accrueInterest(
    MathLib.max(projectionTimestamp, vaultData.lastUpdate),
  );
  const sharesBurntRaw = computeVaultV2ForceWithdrawSharesBurnt({
    vaultData,
    deadlineVaultData: vaultData,
    plan,
  });
  const sharesBurntNow = computeVaultV2ForceWithdrawSharesBurnt({
    vaultData: nowVaultData,
    deadlineVaultData: nowVaultData,
    plan,
  });
  const feeSharesNow = computeVaultV2ForceWithdrawFeeSharesMinted({
    vaultData,
    owner: userAddress,
    timestamp: now,
  });
  const feeSharesProjected = computeVaultV2ForceWithdrawFeeSharesMinted({
    vaultData,
    owner: userAddress,
    timestamp: projectionTimestamp,
  });
  const minSharesBurntProjected = computeVaultV2ForceWithdrawMinSharesBurnt({
    vaultData: projectedVaultData,
    plan,
  });
  // When fee shares are minted, the projected pair bounds every execution time in the window.
  if (
    feeSharesProjected > 0n &&
    feeSharesProjected >= minSharesBurntProjected
  ) {
    throw new VaultV2ForceWithdrawFeeSharesExceedBurnError({
      vault: vault,
      userAddress,
      sharesBurnt: minSharesBurntProjected,
      feeShares: feeSharesProjected,
    });
  }
  // sharesBurntNow ≥ minSharesBurntNow ≥ minSharesBurntProjected > feeSharesProjected ≥ feeSharesNow
  const sharesBurntForFloor = MathLib.max(
    sharesBurntRaw,
    sharesBurntNow - feeSharesNow,
  );
  if (minSharePriceE27Override != null) {
    // The maximum-slippage threshold only bounds the override; unlike the transaction floor it
    // may round to zero, in which case every positive override is acceptable.
    const minAllowedSharePriceE27 =
      _try(
        () =>
          computeMinForceWithdrawSharePrice({
            withdrawnAssets: plan.withdrawnAssets,
            sharesBurnt: sharesBurntForFloor,
            slippageTolerance: MAX_SLIPPAGE_TOLERANCE,
          }),
        VaultV2ForceWithdrawZeroSharePriceError,
      ) ?? 1n;
    if (minSharePriceE27Override < minAllowedSharePriceE27) {
      throw new VaultV2ForceWithdrawSharePriceBelowFloorError({
        minSharePriceE27: minSharePriceE27Override,
        floorE27: minAllowedSharePriceE27,
      });
    }
  }
  const minSharePriceE27 =
    minSharePriceE27Override ??
    computeMinForceWithdrawSharePrice({
      withdrawnAssets: plan.withdrawnAssets,
      sharesBurnt: sharesBurntForFloor,
      slippageTolerance,
    });
  // The floor is deliberately *not* capped at `MAX_ABSOLUTE_SHARE_PRICE` (100 assets/share):
  // lowering a lower bound weakens it, so any vault whose share price grew past that would be left
  // with no real protection. Its two sibling `computeMin*SharePrice` helpers cap nothing either —
  // only the `computeMax*` ones do, where capping relaxes an upper bound and is safe.
  validateUint256Field("minSharePriceE27", minSharePriceE27);
  // This is the minimum allowance needed for successful execution, not an exit cap: the bundle
  // independently rejects a realized share price below `minSharePriceE27`. Include the fee
  // shares minted by the first withdrawal and enough headroom for the configured tolerance.
  const allowanceSharePriceE27 = MathLib.max(
    MathLib.min(
      MathLib.mulDivDown(
        minSharePriceE27,
        MathLib.WAD - slippageTolerance,
        MathLib.WAD,
      ),
      minSharePriceE27 - 1n,
    ),
    1n,
  );
  const requiredShareAllowance = MathLib.min(
    MathLib.max(
      MathLib.mulDivUp(exitAssets, MathLib.RAY, allowanceSharePriceE27),
      MathLib.mulDivUp(exitAssets, MathLib.RAY, minSharePriceE27) + 1n,
    ) + feeSharesProjected,
    maxUint256,
  );

  return { deadline, adapter, minSharePriceE27, requiredShareAllowance };
}

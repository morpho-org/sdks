import {
  type AccrualPosition,
  getChainAddresses,
  type MarketId,
  MarketUtils,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import type { MarketInput as MidnightMarketInput } from "@morpho-org/midnight-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Address, isAddress, isAddressEqual, maxUint128 } from "viem";
import {
  AccrualPositionUserMismatchError,
  AddressMismatchError,
  type BlueReallocationPlan,
  BorrowExceedsSafeLtvError,
  BundlerErrors,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  EmptyReallocationWithdrawalsError,
  ExcessiveSlippageToleranceError,
  InconsistentReallocationPenaltyError,
  InputExceedsMaxError,
  InvalidReallocationAddressError,
  InvalidReallocationShapeError,
  InvalidReallocationSourceTypeError,
  MarketIdMismatchError,
  MissingClientPropertyError,
  MissingMarketPriceError,
  MixedReallocationVersionsError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationWithdrawalOnTargetMarketError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  UnsortedReallocationWithdrawalsError,
  type VaultV1Reallocation,
  type VaultV2BlueReallocation,
  WithdrawExceedsCollateralError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "../types/index.js";
import {
  DEFAULT_LLTV_BUFFER,
  MAX_REALLOCATION_PENALTY,
  MAX_SLIPPAGE_TOLERANCE,
} from "./constant.js";

/** @internal */
export const compareMarketIds = (idA: MarketId, idB: MarketId) => {
  const normalizedIdA = idA.toLowerCase();
  const normalizedIdB = idB.toLowerCase();

  if (normalizedIdA > normalizedIdB) return 1;
  if (normalizedIdA < normalizedIdB) return -1;
  return 0;
};

/**
 * Validates that a raw or hydrated Midnight market belongs to the expected chain.
 *
 * @param market - Midnight market params or hydrated market state.
 * @param chainId - Expected EIP-155 chain id.
 * @returns Nothing when the market belongs to `chainId`.
 * @throws {ChainIdMismatchError} when the market belongs to another chain.
 * @example
 * ```ts
 * import { validateMidnightMarketChainId } from "@morpho-org/morpho-sdk";
 *
 * validateMidnightMarketChainId(marketParams, 8453);
 * ```
 */
export const validateMidnightMarketChainId = (
  market: MidnightMarketInput,
  chainId: number,
): void => {
  const marketParams = "params" in market ? market.params : market;
  validateChainId(Number(marketParams.chainId), chainId);
};

/**
 * Asserts that the client has a connected account AND that it matches
 * the provided user address.
 *
 * Used internally by the signature requirements (`encodeErc20Permit`,
 * `encodeErc20Permit2Approve`) to enforce builder = signer at `sign()` time:
 * the signing flow is the only path where an account/address mismatch
 * is a real security concern (rather than just an integrator footgun).
 *
 * Transaction builders no longer call this helper — callers are
 * responsible for keeping `userAddress` aligned with the signing account
 * at the builder layer.
 *
 * Throws {@link MissingClientPropertyError} if the client has no account.
 * Throws {@link AddressMismatchError} if the client account differs from
 * `userAddress`.
 *
 * @param clientAccountAddress - The client's account address; if undefined,
 *   `MissingClientPropertyError` is thrown.
 * @param userAddress - The user address provided by the caller.
 */
export function validateUserAddress(
  clientAccountAddress: Address | undefined,
  userAddress: Address,
): asserts clientAccountAddress is Address {
  if (clientAccountAddress === undefined) {
    throw new MissingClientPropertyError("account");
  }
  if (!isAddressEqual(clientAccountAddress, userAddress)) {
    throw new AddressMismatchError(clientAccountAddress, userAddress);
  }
}

/**
 * Validates that the accrual position belongs to the expected market and user.
 * Throws {@link MarketIdMismatchError} if the position's market ID
 * does not match the expected market.
 * Throws {@link AccrualPositionUserMismatchError} if the position's user
 * does not match the expected user.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The accrual position to validate.
 * @param params.expectedMarketId - The market ID the position must belong to.
 * @param params.expectedUser - The user address the position must belong to.
 */
export const validateAccrualPosition = (params: {
  positionData: AccrualPosition;
  expectedMarketId: MarketId;
  expectedUser: Address;
}): void => {
  const { positionData, expectedMarketId, expectedUser } = params;
  if (positionData.marketId !== expectedMarketId) {
    throw new MarketIdMismatchError(positionData.marketId, expectedMarketId);
  }
  if (!isAddressEqual(positionData.user, expectedUser)) {
    throw new AccrualPositionUserMismatchError(positionData.user, expectedUser);
  }
};

/**
 * Validates that the resulting position stays within the safe LTV threshold
 * (LLTV minus buffer) after supplying additional collateral and borrowing.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position with market data.
 * @param params.additionalCollateral - Amount of collateral being added.
 * @param params.borrowAmount - Amount being borrowed.
 * @param params.marketId - The market identifier (for error messages).
 * @param params.lltv - The market's liquidation LTV.
 */
export const validatePositionHealth = (params: {
  positionData: AccrualPosition;
  additionalCollateral: bigint;
  borrowAmount: bigint;
  marketId: MarketId;
  lltv: bigint;
}): void => {
  const { positionData, additionalCollateral, borrowAmount, marketId, lltv } =
    params;
  const { price } = positionData.market;

  if (!price) {
    throw new MissingMarketPriceError(marketId);
  }

  const totalCollateralAfter = positionData.collateral + additionalCollateral;
  const collateralValueAfter = MathLib.mulDivDown(
    totalCollateralAfter,
    price,
    ORACLE_PRICE_SCALE,
  );

  const effectiveLltv =
    lltv > DEFAULT_LLTV_BUFFER ? lltv - DEFAULT_LLTV_BUFFER : 0n;

  const maxSafeBorrowAfter = MathLib.wMulDown(
    collateralValueAfter,
    effectiveLltv,
  );

  const totalBorrowAfter = positionData.borrowAssets + borrowAmount + 1n; // +1 to account for share-to-asset rounding (happens when the borrow amount doesn't divide evenly into shares)

  if (totalBorrowAfter > maxSafeBorrowAfter) {
    const maxSafeAdditionalBorrow = MathLib.zeroFloorSub(
      maxSafeBorrowAfter,
      positionData.borrowAssets,
    );
    throw new BorrowExceedsSafeLtvError(borrowAmount, maxSafeAdditionalBorrow);
  }
};

/**
 * Validates that the viem client chain ID matches the expected chain ID.
 * Throws {@link ChainIdMismatchError} if they differ.
 *
 * @param clientChainId - Chain ID reported by the viem client (may be undefined).
 * @param expectedChainId - Chain ID expected by the entity or action.
 */
export const validateChainId = (
  clientChainId: number | undefined,
  expectedChainId: number,
): void => {
  if (clientChainId !== expectedChainId) {
    throw new ChainIdMismatchError(clientChainId, expectedChainId);
  }
};

/**
 * Validates that the given asset is the chain's wrapped native token.
 * Used by any action that may receive `nativeAmount` — the SDK wraps native
 * into wNative, so the target asset must be wNative for the action to succeed.
 *
 * @param chainId - The chain to look up wNative on.
 * @param asset - The asset address to check (collateral, loan, vault asset…).
 * @throws {ChainWNativeMissingError} if wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} if the asset is not wNative.
 */
export const validateNativeAsset = (chainId: number, asset: Address): void => {
  const { wNative } = getChainAddresses(chainId);
  if (!isDefined(wNative)) {
    throw new ChainWNativeMissingError(chainId);
  }
  if (!isAddressEqual(asset, wNative)) {
    throw new NativeAmountOnNonWNativeAssetError(asset, wNative);
  }
};

/**
 * Validates that the resulting position stays within the safe LTV threshold
 * (LLTV minus buffer) after withdrawing collateral.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position with market data.
 * @param params.withdrawAmount - Amount of collateral being withdrawn.
 * @param params.lltv - The market's liquidation LTV.
 * @param params.marketId - The market identifier (for error messages).
 */
export const validatePositionHealthAfterWithdraw = (params: {
  positionData: AccrualPosition;
  withdrawAmount: bigint;
  lltv: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, withdrawAmount, lltv, marketId } = params;

  if (positionData.marketId !== marketId) {
    throw new MarketIdMismatchError(positionData.marketId, marketId);
  }
  if (withdrawAmount > positionData.collateral) {
    throw new WithdrawExceedsCollateralError({
      withdrawAmount,
      available: positionData.collateral,
      market: marketId,
    });
  }

  // No debt means position is always healthy — oracle price not needed.
  if (positionData.borrowAssets === 0n) {
    return;
  }

  const { price } = positionData.market;

  if (!price) {
    throw new MissingMarketPriceError(positionData.marketId);
  }

  const collateralAfter = positionData.collateral - withdrawAmount;
  const collateralValueAfter = MathLib.mulDivDown(
    collateralAfter,
    price,
    ORACLE_PRICE_SCALE,
  );

  const effectiveLltv =
    lltv > DEFAULT_LLTV_BUFFER ? lltv - DEFAULT_LLTV_BUFFER : 0n;
  const maxSafeBorrowAfter = MathLib.wMulDown(
    collateralValueAfter,
    effectiveLltv,
  );

  if (positionData.borrowAssets > maxSafeBorrowAfter) {
    throw new WithdrawMakesPositionUnhealthyError({
      withdrawAmount,
      borrowAssets: positionData.borrowAssets,
      maxSafeBorrow: maxSafeBorrowAfter,
    });
  }
};

/**
 * Validates that the repay amount assets does not exceed the outstanding debt.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.repayAssets - The amount of assets to repay.
 * @param params.marketId - The market identifier (for error messages).
 */
export const validateRepayAmount = (params: {
  positionData: AccrualPosition;
  repayAssets: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, repayAssets, marketId } = params;
  if (repayAssets > positionData.borrowAssets) {
    throw new RepayExceedsDebtError({
      repayAmount: repayAssets,
      debt: positionData.borrowAssets,
      market: marketId,
    });
  }
};

/**
 * Validates that the repay shares do not exceed the outstanding borrow shares.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.repayShares - The amount of shares to repay.
 * @param params.marketId - The market identifier (for error messages).
 */
export const validateRepayShares = (params: {
  positionData: AccrualPosition;
  repayShares: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, repayShares, marketId } = params;
  if (repayShares > positionData.borrowShares) {
    throw new RepaySharesExceedDebtError({
      repayShares,
      borrowShares: positionData.borrowShares,
      market: marketId,
    });
  }
};

/**
 * Validates that Vault V1 PublicAllocator reallocations are well-formed.
 *
 * @param reallocations - Vault V1 reallocations to validate.
 * @param targetMarketId - The operation's target market ID.
 * @returns Nothing when every reallocation is valid.
 * @throws {NegativeInputError} when a reallocation fee is negative.
 * @throws {EmptyReallocationWithdrawalsError} when a reallocation has no withdrawals.
 * @throws {NonPositiveInputError} when a withdrawal amount is non-positive.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when withdrawals are not strictly market-id sorted.
 * @example
 * ```ts
 * import type { BlueMarketId } from "@morpho-org/morpho-sdk/types";
 * import { validateReallocations } from "@morpho-org/morpho-sdk";
 * import { zeroHash } from "viem";
 *
 * const result: void = validateReallocations([], zeroHash as BlueMarketId);
 * ```
 */
export const validateReallocations = (
  reallocations: Iterable<VaultV1Reallocation>,
  targetMarketId: MarketId,
): void => {
  for (const reallocation of reallocations) {
    if (reallocation.fee < 0n) {
      throw new NegativeInputError("reallocation.fee", reallocation.fee);
    }
    if (reallocation.withdrawals.length === 0) {
      throw new EmptyReallocationWithdrawalsError(reallocation.vault);
    }
    let previousMarketId: MarketId | undefined;
    for (const withdrawal of reallocation.withdrawals) {
      if (withdrawal.amount <= 0n) {
        throw new NonPositiveInputError(
          `reallocation.withdrawals[${withdrawal.marketParams.id}].amount`,
          withdrawal.amount,
        );
      }
      if (withdrawal.marketParams.id === targetMarketId) {
        throw new ReallocationWithdrawalOnTargetMarketError(
          reallocation.vault,
          withdrawal.marketParams.id,
        );
      }
      if (
        previousMarketId !== undefined &&
        compareMarketIds(withdrawal.marketParams.id, previousMarketId) <= 0
      ) {
        throw new UnsortedReallocationWithdrawalsError(
          reallocation.vault,
          withdrawal.marketParams.id,
        );
      }
      previousMarketId = withdrawal.marketParams.id;
    }
  }
};

/** @internal */
export const validateVaultV2BlueReallocations = (
  reallocations: Iterable<VaultV2BlueReallocation>,
  targetMarketId: MarketId,
): void => {
  const penaltyByVault = new Map<string, bigint>();

  for (const reallocation of reallocations) {
    if (
      typeof reallocation.vault !== "string" ||
      !isAddress(reallocation.vault)
    ) {
      throw new InvalidReallocationAddressError("vault");
    }
    if (
      reallocation.to == null ||
      typeof reallocation.to.adapter !== "string" ||
      !isAddress(reallocation.to.adapter)
    ) {
      throw new InvalidReallocationAddressError("to.adapter");
    }

    const source = reallocation.from;
    if (source == null) {
      throw new InvalidReallocationSourceTypeError(undefined);
    }
    const sourceType: string | undefined = source.type;
    if (sourceType !== "market" && sourceType !== "idle") {
      throw new InvalidReallocationSourceTypeError(sourceType);
    }
    let sourceMarketId: MarketId | undefined;
    if (source.type === "market") {
      if (typeof source.adapter !== "string" || !isAddress(source.adapter)) {
        throw new InvalidReallocationAddressError("from.adapter");
      }
      if (
        source.marketParams == null ||
        !isAddress(source.marketParams.loanToken) ||
        !isAddress(source.marketParams.collateralToken) ||
        !isAddress(source.marketParams.oracle) ||
        !isAddress(source.marketParams.irm) ||
        typeof source.marketParams.lltv !== "bigint"
      ) {
        throw new InvalidReallocationSourceTypeError("market", "marketParams");
      }
      sourceMarketId = MarketUtils.getMarketId(source.marketParams);
    }
    if (reallocation.penalty < 0n) {
      throw new NegativeInputError(
        "reallocation.penalty",
        reallocation.penalty,
      );
    }
    if (reallocation.penalty > MAX_REALLOCATION_PENALTY) {
      throw new InputExceedsMaxError({
        field: "reallocation.penalty",
        value: reallocation.penalty,
        max: MAX_REALLOCATION_PENALTY,
      });
    }
    if (reallocation.assets <= 0n) {
      throw new NonPositiveInputError(
        "reallocation.assets",
        reallocation.assets,
      );
    }
    if (reallocation.assets > maxUint128) {
      throw new InputExceedsMaxError({
        field: "reallocation.assets",
        value: reallocation.assets,
        max: maxUint128,
      });
    }

    const penaltyKey = reallocation.vault.toLowerCase();
    const expectedPenalty = penaltyByVault.get(penaltyKey);
    if (
      expectedPenalty !== undefined &&
      expectedPenalty !== reallocation.penalty
    ) {
      throw new InconsistentReallocationPenaltyError({
        vault: reallocation.vault,
        expected: expectedPenalty,
        actual: reallocation.penalty,
      });
    }
    penaltyByVault.set(penaltyKey, reallocation.penalty);

    if (
      sourceMarketId !== undefined &&
      compareMarketIds(sourceMarketId, targetMarketId) === 0
    ) {
      throw new ReallocationWithdrawalOnTargetMarketError(
        reallocation.vault,
        sourceMarketId,
      );
    }
  }
};

/**
 * Validates and normalizes a homogeneous Blue reallocation plan.
 *
 * @param params - Validation parameters.
 * @param params.reallocations - Optional Vault V1 or Vault V2 reallocation plan.
 * @param params.targetMarketId - Morpho Blue market receiving the liquidity.
 * @param params.chainId - Chain whose allocator deployment is required for a V2 plan.
 * @returns The validated plan tagged with its allocator version.
 * @throws {BundlerErrors.UnexpectedAction} when a V2 plan is unsupported on the chain.
 * @internal
 */
export const validateAndNormalizeReallocations = ({
  reallocations,
  targetMarketId,
  chainId,
}: {
  readonly reallocations: BlueReallocationPlan | undefined;
  readonly targetMarketId: MarketId;
  readonly chainId: number;
}) => {
  const vaultV1Reallocations: VaultV1Reallocation[] = [];
  const vaultV2Reallocations: VaultV2BlueReallocation[] = [];

  for (const reallocation of reallocations ?? []) {
    if (typeof reallocation !== "object" || reallocation === null) {
      throw new InvalidReallocationShapeError();
    }
    if ("from" in reallocation === "withdrawals" in reallocation) {
      throw new InvalidReallocationShapeError();
    }
    if ("withdrawals" in reallocation) {
      vaultV1Reallocations.push(reallocation);
    } else {
      vaultV2Reallocations.push(reallocation);
    }
  }

  if (vaultV1Reallocations.length > 0 && vaultV2Reallocations.length > 0) {
    throw new MixedReallocationVersionsError();
  }
  if (vaultV2Reallocations.length > 0) {
    validateVaultV2BlueReallocations(vaultV2Reallocations, targetMarketId);
    if (getChainAddresses(chainId).vaultV2BluePublicAllocator == null) {
      throw new BundlerErrors.UnexpectedAction(
        vaultV2Reallocations[0]?.from.type === "market"
          ? "vaultV2BluePublicAllocatorReallocate"
          : "vaultV2BluePublicAllocatorAllocateFromIdle",
        chainId,
      );
    }
    return {
      type: "vaultV2Blue" as const,
      reallocations: vaultV2Reallocations,
    };
  }

  validateReallocations(vaultV1Reallocations, targetMarketId);
  return { type: "vaultV1" as const, reallocations: vaultV1Reallocations };
};

/**
 * Validates that a slippage tolerance is within an acceptable range.
 *
 * Throws {@link NegativeInputError} if negative.
 * Throws {@link ExcessiveSlippageToleranceError} if greater than {@link MAX_SLIPPAGE_TOLERANCE}.
 *
 * @param slippageTolerance - The slippage tolerance in WAD.
 * @returns Nothing when the slippage tolerance is valid.
 * @throws {NegativeInputError} when `slippageTolerance < 0n`.
 * @throws {ExcessiveSlippageToleranceError} when the tolerance exceeds the SDK maximum.
 * @example
 * ```ts
 * import { validateSlippageTolerance } from "@morpho-org/morpho-sdk";
 *
 * const result: void = validateSlippageTolerance(5_000000000000000n);
 * ```
 */
export const validateSlippageTolerance = (slippageTolerance: bigint): void => {
  if (slippageTolerance < 0n) {
    throw new NegativeInputError("slippageTolerance", slippageTolerance);
  }
  if (slippageTolerance > MAX_SLIPPAGE_TOLERANCE) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }
};

/**
 * Validates that the withdraw assets do not exceed the user's supplied assets in the market.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.withdrawAssets - The amount of assets to withdraw.
 * @param params.marketId - The market identifier (for error messages).
 * @throws {WithdrawExceedsSupplyError} when `withdrawAssets > positionData.supplyAssets`.
 */
export const validateWithdrawAmount = (params: {
  positionData: AccrualPosition;
  withdrawAssets: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, withdrawAssets, marketId } = params;
  if (withdrawAssets > positionData.supplyAssets) {
    throw new WithdrawExceedsSupplyError({
      withdrawAmount: withdrawAssets,
      available: positionData.supplyAssets,
      market: marketId,
    });
  }
};

/**
 * Validates that the withdraw shares do not exceed the user's owned supply shares in the market.
 *
 * @param params - Validation parameters.
 * @param params.positionData - The current accrual position.
 * @param params.withdrawShares - The amount of shares to withdraw.
 * @param params.marketId - The market identifier (for error messages).
 * @throws {WithdrawSharesExceedSupplyError} when `withdrawShares > positionData.supplyShares`.
 */
export const validateWithdrawShares = (params: {
  positionData: AccrualPosition;
  withdrawShares: bigint;
  marketId: MarketId;
}): void => {
  const { positionData, withdrawShares, marketId } = params;
  if (withdrawShares > positionData.supplyShares) {
    throw new WithdrawSharesExceedSupplyError({
      withdrawShares,
      supplyShares: positionData.supplyShares,
      market: marketId,
    });
  }
};

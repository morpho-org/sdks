import {
  type AccrualPosition,
  getChainAddresses,
  type MarketId,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  AccrualPositionUserMismatchError,
  AddressMismatchError,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  EmptyReallocationWithdrawalsError,
  ExcessiveSlippageToleranceError,
  MarketIdMismatchError,
  MissingClientPropertyError,
  MissingMarketPriceError,
  MutuallyExclusiveRepayAmountsError,
  NativeAmountExceedsTransferAmountError,
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NegativeReallocationFeeError,
  NegativeSlippageToleranceError,
  NonPositiveReallocationAmountError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  ReallocationWithdrawalOnTargetMarketError,
  type RepayActionAmountArgs,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  UnsortedReallocationWithdrawalsError,
  type VaultReallocation,
  WithdrawExceedsCollateralError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "../types/index.js";
import { DEFAULT_LLTV_BUFFER, MAX_SLIPPAGE_TOLERANCE } from "./constant.js";

/** @internal */
export const compareMarketIds = (idA: MarketId, idB: MarketId) => {
  const normalizedIdA = idA.toLowerCase();
  const normalizedIdB = idB.toLowerCase();

  if (normalizedIdA > normalizedIdB) return 1;
  if (normalizedIdA < normalizedIdB) return -1;
  return 0;
};

/**
 * Asserts that the client has a connected account AND that it matches
 * the provided user address.
 *
 * Used internally by the signature requirements (`encodeErc20Permit`,
 * `encodeErc20Permit2`) to enforce builder = signer at `sign()` time:
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
 * Validates and resolves the repay funding args (shared by `blueRepay` and
 * `blueRepayWithdrawCollateral`) into the concrete amounts the bundle needs.
 *
 * Two modes, discriminated on the presence of `shares`:
 *
 * - **assets mode** (`amount` and/or `nativeAmount`): additive, like `blueSupply`.
 *   The exact repaid assets are `amount + nativeAmount`; the ERC-20 pulled is
 *   `amount` and `nativeAmount` is wrapped. No residual.
 * - **shares mode** (`shares` + `transferAmount`): repays exact shares. The ERC-20
 *   pulled is `transferAmount − nativeAmount` (native is carved out of the
 *   upper-bound funding envelope) and `nativeAmount` is wrapped; residual loan
 *   token is skimmed back to the receiver by the caller.
 *
 * Does not check that the asset is wNative — the caller runs {@link validateNativeAsset}
 * (it needs the chain id) only when `nativeAmount > 0n`.
 *
 * @param params - Resolution parameters.
 * @param params.args - Repay funding args ({@link RepayActionAmountArgs}).
 * @param params.maxSharePrice - Maximum repay share price (in ray). Must be positive.
 * @param params.marketId - The market identifier (for error messages).
 * @returns The resolved `repayAssets` / `repayShares` (for `morphoRepay`), the
 *   `erc20Amount` to pull, the total `transferAmount`, the `nativeAmount` to wrap,
 *   and `isSharesMode`.
 * @throws {NonPositiveRepayMaxSharePriceError} when `maxSharePrice <= 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {MutuallyExclusiveRepayAmountsError} when both `amount` and `shares` are present.
 * @throws {NonPositiveRepayAmountError} when the resolved repay amount is non-positive
 *   (assets mode: `amount + nativeAmount <= 0n`; shares mode: `shares <= 0n`).
 * @throws {NonPositiveTransferAmountError} when in shares mode and `transferAmount <= 0n`.
 * @throws {NativeAmountExceedsTransferAmountError} when in shares mode and
 *   `nativeAmount > transferAmount`.
 */
export const resolveRepayAmounts = ({
  args,
  maxSharePrice,
  marketId,
}: {
  args: RepayActionAmountArgs;
  maxSharePrice: bigint;
  marketId: MarketId;
}): {
  repayAssets: bigint;
  repayShares: bigint;
  erc20Amount: bigint;
  transferAmount: bigint;
  nativeAmount: bigint;
  isSharesMode: boolean;
} => {
  if (maxSharePrice <= 0n) {
    throw new NonPositiveRepayMaxSharePriceError(marketId);
  }

  const nativeAmount = args.nativeAmount ?? 0n;
  if (nativeAmount < 0n) {
    throw new NegativeNativeAmountError(nativeAmount);
  }

  const hasAmount = "amount" in args && args.amount !== undefined;

  if ("shares" in args && args.shares !== undefined) {
    if (hasAmount) {
      throw new MutuallyExclusiveRepayAmountsError(marketId);
    }

    const { shares, transferAmount } = args;
    if (shares <= 0n) {
      throw new NonPositiveRepayAmountError(marketId);
    }
    if (transferAmount <= 0n) {
      throw new NonPositiveTransferAmountError(marketId);
    }

    const erc20Amount = transferAmount - nativeAmount;
    if (erc20Amount < 0n) {
      throw new NativeAmountExceedsTransferAmountError({
        nativeAmount,
        transferAmount,
        market: marketId,
      });
    }

    return {
      repayAssets: 0n,
      repayShares: shares,
      erc20Amount,
      transferAmount,
      nativeAmount,
      isSharesMode: true,
    };
  }

  // assets mode (additive): repay exactly `amount + nativeAmount`.
  const amount = ("amount" in args ? args.amount : undefined) ?? 0n;
  if (amount < 0n) {
    throw new NonPositiveRepayAmountError(marketId);
  }

  const repayAssets = amount + nativeAmount;
  if (repayAssets <= 0n) {
    throw new NonPositiveRepayAmountError(marketId);
  }

  return {
    repayAssets,
    repayShares: 0n,
    erc20Amount: amount,
    transferAmount: repayAssets,
    nativeAmount,
    isSharesMode: false,
  };
};

/**
 * Validates that vault reallocations are well-formed.
 *
 * Enforces the following invariants for each {@link VaultReallocation}:
 * - `fee` must be non-negative.
 * - `withdrawals` must be non-empty.
 * - Every withdrawal `amount` must be strictly positive.
 * - No withdrawal may target `targetMarketId` (the operation's target market — the market being
 *   borrowed from for `borrow`, or being withdrawn from for `withdraw`).
 * - Withdrawal market IDs must be strictly ascending (required by `PublicAllocator.reallocateTo`).
 *
 * @param reallocations - The reallocations to validate.
 * @param targetMarketId - The ID of the operation's target market. No withdrawal may reference this market.
 */
export const validateReallocations = (
  reallocations: readonly VaultReallocation[],
  targetMarketId: MarketId,
): void => {
  for (const r of reallocations) {
    if (r.fee < 0n) {
      throw new NegativeReallocationFeeError(r.vault);
    }
    if (r.withdrawals.length === 0) {
      throw new EmptyReallocationWithdrawalsError(r.vault);
    }
    let prevId: MarketId | undefined;
    for (const w of r.withdrawals) {
      if (w.amount <= 0n) {
        throw new NonPositiveReallocationAmountError(
          r.vault,
          w.marketParams.id,
        );
      }
      if (w.marketParams.id === targetMarketId) {
        throw new ReallocationWithdrawalOnTargetMarketError(
          r.vault,
          w.marketParams.id,
        );
      }
      if (
        prevId !== undefined &&
        compareMarketIds(w.marketParams.id, prevId) <= 0
      ) {
        throw new UnsortedReallocationWithdrawalsError(
          r.vault,
          w.marketParams.id,
        );
      }
      prevId = w.marketParams.id;
    }
  }
};

/**
 * Validates that a slippage tolerance is within an acceptable range.
 *
 * Throws {@link NegativeSlippageToleranceError} if negative.
 * Throws {@link ExcessiveSlippageToleranceError} if greater than {@link MAX_SLIPPAGE_TOLERANCE}.
 *
 * @param slippageTolerance - The slippage tolerance in WAD.
 */
export const validateSlippageTolerance = (slippageTolerance: bigint): void => {
  if (slippageTolerance < 0n) {
    throw new NegativeSlippageToleranceError(slippageTolerance);
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

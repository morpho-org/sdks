import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type BlueRefinanceAction,
  type Metadata,
  NegativeBorrowSharesError,
  NegativeMaxRepaySharePriceError,
  NonPositiveAssetAmountError,
  NonPositiveMinBorrowSharePriceError,
  NonPositiveRepayMaxSharePriceError,
  RefinanceSameMarketError,
  RefinanceSharesMissingBorrowAssetsError,
  RefinanceTokenMismatchError,
  type Transaction,
  type VaultReallocation,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

/** Parameters for {@link blueRefinance}. */
export interface BlueRefinanceParams {
  source: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  target: {
    readonly marketParams: MarketParams;
  };
  args: {
    user: Address;
    collateralAmount: bigint;
    /**
     * Loan assets to borrow on the target. Assets mode: the exact borrow (exclusive with
     * `borrowShares`). Shares mode: the positive overshoot covering accrual + slippage; omitting it
     * throws {@link RefinanceSharesMissingBorrowAssetsError}.
     */
    borrowAssets?: bigint;
    /** Source borrow shares to repay (immune to mid-tx accrual); exclusive with `borrowAssets`. */
    borrowShares?: bigint;
    /** Minimum borrow share price on the target market (in ray). */
    minBorrowSharePrice: bigint;
    /** Maximum repay share price on the source market (in ray); must be > 0 when a repay leg exists. */
    maxRepaySharePrice: bigint;
    /** PublicAllocator reallocations into the target market, run before the bundle. Fees add to `tx.value`. */
    targetReallocations?: readonly VaultReallocation[];
  };
  metadata?: Metadata;
}

/**
 * Prepares an atomic refinance migrating a Morpho Blue position to another market on the same
 * chain that shares the same loan and collateral tokens.
 *
 * Strategy: flash-collateral via the target's `onMorphoSupplyCollateral` callback. The collateral
 * is credited before the deferred `safeTransferFrom`, so inside the callback GA1 borrows on the
 * target, repays the source, then withdraws the source collateral to settle the transfer.
 *
 * Bundle shape (callback contents depend on borrow mode):
 *
 * ```text
 * // optional: one reallocateTo per targetReallocations entry, run first
 * reallocateTo(vault_i, fee_i, withdrawals_i, target, false),
 *
 * morphoSupplyCollateral(target, collateralAmount, user, [
 *   // omitted in collat-only mode
 *   morphoBorrow(target, borrowAssets, 0, minBorrowSharePrice, GA1),
 *   morphoRepay(source, assets|0, 0|shares, maxRepaySharePrice, user, []),
 *   // shares mode only: sweep overshoot before the withdraw so same-token markets aren't drained
 *   morphoRepay(target, maxUint256, 0, maxUint256, user, [], skipRevert=true),
 *   // shares mode only: fallback if the repay is skipped, skim residual loan tokens to the user
 *   erc20Transfer(loanToken, user, maxUint256, GA1, skipRevert=false),
 *   morphoWithdrawCollateral(source, collateralAmount, GA1),
 * ])
 * ```
 *
 * Borrow modes:
 *
 * - **Assets mode** (`borrowAssets > 0n`): exact-asset borrow and repay, no GA1 dust.
 * - **Shares mode** (`borrowShares > 0n`, `borrowAssets` is the overshoot): the trailing
 *   `morphoRepay(target, maxUint256, …, skipRevert=true)` sweeps the residual into the target debt,
 *   then an `erc20Transfer` skims any residual to the user if that repay is skipped.
 * - **Collat-only** (both zero/omitted): only collateral is migrated; borrow/repay legs omitted.
 *
 * Prerequisite: GA1 must be authorized on Blue — the entity's `getRequirements()` returns the
 * `setAuthorization` transaction when needed.
 *
 * @param params.source.chainId - The chain both markets live on.
 * @param params.source.marketParams - Source market params (the position being closed).
 * @param params.target.marketParams - Target market params; must share both tokens with the source.
 * @param params.args.user - Position owner on both markets.
 * @param params.args.collateralAmount - Amount of collateral to migrate.
 * @param params.args.borrowAssets - Loan assets to borrow on the target; exclusive with `borrowShares`. Defaults to `0n`.
 * @param params.args.borrowShares - Borrow shares to repay on the source; exclusive with `borrowAssets`. Defaults to `0n`.
 * @param params.args.minBorrowSharePrice - Minimum borrow share price (ray) on the target.
 * @param params.args.maxRepaySharePrice - Maximum repay share price (ray) on the source.
 * @param params.args.targetReallocations - PublicAllocator reallocations into the target, run before the supply leg.
 * @param params.metadata - Optional analytics metadata appended to `tx.data`.
 * @returns A deep-frozen `Transaction<BlueRefinanceAction>`.
 * @remarks `borrowAssets` and `borrowShares` describe different markets (target borrow vs. source
 * repay); in shares mode the entity passes both. Caller-facing mutual exclusivity is enforced at the entity layer.
 * @throws {ZeroCollateralAmountError} when `collateralAmount <= 0n`.
 * @throws {NonPositiveAssetAmountError} when `borrowAssets < 0n`.
 * @throws {NegativeBorrowSharesError} when `borrowShares < 0n`.
 * @throws {NonPositiveMinBorrowSharePriceError} when `minBorrowSharePrice < 0n`.
 * @throws {NegativeMaxRepaySharePriceError} when `maxRepaySharePrice < 0n`.
 * @throws {RefinanceSameMarketError} when source and target market ids are equal.
 * @throws {RefinanceTokenMismatchError} when source and target do not share both tokens.
 * @throws {RefinanceSharesMissingBorrowAssetsError} when `borrowShares > 0n` but `borrowAssets` is omitted or non-positive.
 * @throws {NonPositiveRepayMaxSharePriceError} when a repay leg is encoded and `maxRepaySharePrice <= 0n`.
 * @throws {NegativeReallocationFeeError} when any `reallocation.fee < 0n`.
 * @throws {EmptyReallocationWithdrawalsError} when any `reallocation.withdrawals` is empty.
 * @throws {NonPositiveReallocationAmountError} when any `reallocation.withdrawals[i].amount <= 0n`.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a reallocation withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when reallocation withdrawals are not strictly sorted by market id.
 * @example
 * ```ts
 * import { blueRefinance } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueRefinance({
 *   source: { chainId: 1, marketParams: sourceParams },
 *   target: { marketParams: targetParams },
 *   args: {
 *     user: borrower,
 *     collateralAmount: 1_000_000_000_000_000_000n,
 *     borrowShares: 500_000_000_000n,
 *     borrowAssets: 501_000_000n, // overshoot computed by entity layer
 *     minBorrowSharePrice: 0n,
 *     maxRepaySharePrice: 1_500_000_000_000_000_000_000_000_000n,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueRefinanceAction>>
 * ```
 */
export const blueRefinance = ({
  source: { chainId, marketParams: sourceParams },
  target: { marketParams: targetParams },
  args: {
    user,
    collateralAmount,
    borrowAssets = 0n,
    borrowShares = 0n,
    minBorrowSharePrice,
    maxRepaySharePrice,
    targetReallocations,
  },
  metadata,
}: BlueRefinanceParams): Readonly<Transaction<BlueRefinanceAction>> => {
  if (collateralAmount <= 0n) {
    throw new ZeroCollateralAmountError(sourceParams.id);
  }

  if (borrowAssets < 0n) {
    throw new NonPositiveAssetAmountError(sourceParams.loanToken);
  }

  if (borrowShares < 0n) {
    throw new NegativeBorrowSharesError(sourceParams.id);
  }

  if (minBorrowSharePrice < 0n) {
    throw new NonPositiveMinBorrowSharePriceError(targetParams.id);
  }

  if (maxRepaySharePrice < 0n) {
    throw new NegativeMaxRepaySharePriceError(sourceParams.id);
  }

  if (sourceParams.id === targetParams.id) {
    throw new RefinanceSameMarketError(sourceParams.id);
  }

  if (
    !isAddressEqual(
      sourceParams.collateralToken,
      targetParams.collateralToken,
    ) ||
    !isAddressEqual(sourceParams.loanToken, targetParams.loanToken)
  ) {
    throw new RefinanceTokenMismatchError(sourceParams.id, targetParams.id);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const sharesMode = borrowShares > 0n;
  const shouldMigrateBorrow = borrowAssets > 0n || sharesMode;

  // Shares mode borrows in assets; Morpho rejects a zero borrow, so require a positive overshoot.
  if (sharesMode && borrowAssets <= 0n) {
    throw new RefinanceSharesMissingBorrowAssetsError(sourceParams.id);
  }

  // A repay leg with maxRepaySharePrice = 0n always reverts; require a positive cap when debt is migrated.
  if (shouldMigrateBorrow && maxRepaySharePrice <= 0n) {
    throw new NonPositiveRepayMaxSharePriceError(sourceParams.id);
  }

  const callback: Action[] = [];

  if (shouldMigrateBorrow) {
    callback.push({
      type: "morphoBorrow",
      args: [
        targetParams,
        borrowAssets,
        0n,
        minBorrowSharePrice,
        generalAdapter1,
        false,
      ],
    });

    callback.push(
      sharesMode
        ? {
            type: "morphoRepay",
            args: [
              sourceParams,
              0n,
              borrowShares,
              maxRepaySharePrice,
              user,
              [],
              false,
            ],
          }
        : {
            type: "morphoRepay",
            args: [
              sourceParams,
              borrowAssets,
              0n,
              maxRepaySharePrice,
              user,
              [],
              false,
            ],
          },
    );
  }

  // Sweep the borrow overshoot back into target debt so GA1 ends drained. Must run before the
  // withdraw: in same-token markets maxUint256 would otherwise drain the just-withdrawn collateral.
  if (sharesMode) {
    callback.push({
      type: "morphoRepay",
      args: [targetParams, maxUint256, 0n, maxUint256, user, [], true],
    });
    // Fallback: if the repay above is skipped, skim any residual loan tokens to the user.
    callback.push({
      type: "erc20Transfer",
      args: [targetParams.loanToken, user, maxUint256, generalAdapter1, false],
    });
  }

  callback.push({
    type: "morphoWithdrawCollateral",
    args: [sourceParams, collateralAmount, generalAdapter1, false],
  });

  const actions: Action[] = [];
  let reallocationFee = 0n;

  if (targetReallocations && targetReallocations.length > 0) {
    const result = buildReallocationActions(targetReallocations, targetParams);
    actions.push(...result.actions);
    reallocationFee = result.fee;
  }

  actions.push({
    type: "morphoSupplyCollateral",
    args: [targetParams, collateralAmount, user, callback, false],
  });

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueRefinance",
      args: {
        sourceMarket: sourceParams.id,
        targetMarket: targetParams.id,
        collateralAmount,
        borrowAssets,
        borrowShares,
        minBorrowSharePrice,
        maxRepaySharePrice,
        user,
        reallocationFee,
      },
    },
  });
};

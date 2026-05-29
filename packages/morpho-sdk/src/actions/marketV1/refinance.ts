import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type MarketV1RefinanceAction,
  type Metadata,
  NegativeBorrowSharesError,
  NegativeMaxRepaySharePriceError,
  NonPositiveAssetAmountError,
  NonPositiveMinBorrowSharePriceError,
  RefinanceSameMarketError,
  RefinanceSharesMissingBorrowAssetsError,
  RefinanceTokenMismatchError,
  type Transaction,
  ZeroCollateralAmountError,
} from "../../types/index.js";

/** Parameters for {@link marketV1Refinance}. */
export interface MarketV1RefinanceParams {
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
    /** Loan assets to borrow on the target market (mutually exclusive with `borrowShares`). */
    borrowAssets?: bigint;
    /** Source borrow shares to repay (mutually exclusive with `borrowAssets`). */
    borrowShares?: bigint;
    /** Minimum borrow share price on the target market (in ray). */
    minBorrowSharePrice: bigint;
    /** Maximum repay share price on the source market (in ray). */
    maxRepaySharePrice: bigint;
  };
  metadata?: Metadata;
}

/**
 * Prepares an atomic refinance transaction migrating a Morpho Blue position from one market to
 * another **on the same chain, with the same loan and collateral tokens**.
 *
 * Strategy: flash-collateral via the `onMorphoSupplyCollateral` callback on the target market.
 * The on-chain order in `Morpho.supplyCollateral` credits the target position with the collateral
 * **before** the `safeTransferFrom`, so the callback runs with the target position already
 * collateralised. Inside the callback, `GeneralAdapter1` borrows from the target, repays the
 * source, then withdraws the source's collateral to `GeneralAdapter1` — which satisfies the
 * deferred `safeTransferFrom` to close the target supply.
 *
 * Bundle shape (callback contents depend on borrow mode):
 *
 * ```text
 * morphoSupplyCollateral(target, collateralAmount, user, [
 *   // omitted when no debt is migrated (collat-only refinance)
 *   morphoBorrow(target, borrowAssets, 0, minBorrowSharePrice, GA1),
 *   morphoRepay(source, assets|0, 0|shares, maxRepaySharePrice, user, []),
 *
 *   morphoWithdrawCollateral(source, collateralAmount, GA1),
 *
 *   // shares mode only — sweeps borrow overshoot back into the target debt
 *   morphoRepay(target, maxUint256, 0, maxUint256, user, [], skipRevert=true),
 * ])
 * ```
 *
 * Borrow modes:
 *
 * - **Assets mode** (`borrowAssets > 0n`, `borrowShares` omitted): exact-asset borrow and repay.
 *   No residual loan-token dust in GA1.
 * - **Shares mode** (`borrowShares > 0n`, `borrowAssets` is the overshoot amount): the entity layer
 *   inflates `borrowAssets` to cover accrual + slippage; the trailing
 *   `morphoRepay(target, maxUint256, …, skipRevert=true)` sweeps the residual into the target debt
 *   so GA1 finishes drained.
 * - **Collat-only** (both `borrowAssets` and `borrowShares` are zero/omitted): only the source's
 *   collateral is migrated. The borrow/repay legs are omitted.
 *
 * Prerequisite: `GeneralAdapter1` must be authorized on Morpho — the entity layer's
 * `getRequirements()` returns the `setAuthorization` transaction when needed.
 *
 * @param params.source.chainId - The chain both markets live on.
 * @param params.source.marketParams - Source market params (the position being closed).
 * @param params.target.marketParams - Target market params. Must share loanToken and
 *   collateralToken with the source.
 * @param params.args.user - Position owner on both markets. `morphoBorrow` is `onBehalf=user`
 *   (Morpho checks GA1's authorization for `user`); `morphoWithdrawCollateral` uses GA1's
 *   `_initiator()` internally and resolves to the same address.
 * @param params.args.collateralAmount - Amount of collateral to migrate.
 * @param params.args.borrowAssets - Loan-asset amount to borrow on the target. Mutually exclusive
 *   with `borrowShares`. Defaults to `0n`.
 * @param params.args.borrowShares - Borrow shares to repay on the source. Mutually exclusive with
 *   `borrowAssets`. Defaults to `0n`. In shares mode the entity layer passes an overshooting
 *   `borrowAssets` separately so the callback can post-sweep.
 * @param params.args.minBorrowSharePrice - Minimum borrow share price (ray) on the target — slippage
 *   protection for the target borrow leg.
 * @param params.args.maxRepaySharePrice - Maximum repay share price (ray) on the source — slippage
 *   protection for the source repay leg.
 * @param params.metadata - Optional analytics metadata appended to `tx.data`.
 * @returns A deep-frozen `Transaction<MarketV1RefinanceAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @remarks
 * `borrowAssets` and `borrowShares` describe **different markets** (target borrow vs. source
 * repay). In shares mode the entity layer passes both: `borrowAssets` carries the overshoot for
 * the target borrow, `borrowShares` carries the exact source repay amount. Caller-facing
 * mutual-exclusivity (only one of the two is user-meaningful) is enforced at the entity layer.
 * @throws {ZeroCollateralAmountError} when `collateralAmount <= 0n`.
 * @throws {NonPositiveAssetAmountError} when `borrowAssets < 0n`.
 * @throws {NegativeBorrowSharesError} when `borrowShares < 0n`.
 * @throws {NonPositiveMinBorrowSharePriceError} when `minBorrowSharePrice < 0n`.
 * @throws {NegativeMaxRepaySharePriceError} when `maxRepaySharePrice < 0n`.
 * @throws {RefinanceSameMarketError} when source and target market ids are equal.
 * @throws {RefinanceTokenMismatchError} when source and target do not share both tokens.
 * @throws {RefinanceSharesMissingBorrowAssetsError} when `borrowShares > 0n` but `borrowAssets`
 *   is omitted or non-positive — the target `morphoBorrow` requires a positive asset overshoot.
 * @example
 * ```ts
 * import { marketV1Refinance } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1Refinance({
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
 * // tx satisfies Readonly<Transaction<MarketV1RefinanceAction>>
 * ```
 */
export const marketV1Refinance = ({
  source: { chainId, marketParams: sourceParams },
  target: { marketParams: targetParams },
  args: {
    user,
    collateralAmount,
    borrowAssets = 0n,
    borrowShares = 0n,
    minBorrowSharePrice,
    maxRepaySharePrice,
  },
  metadata,
}: MarketV1RefinanceParams): Readonly<Transaction<MarketV1RefinanceAction>> => {
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

  // Shares mode encodes `morphoBorrow(target, borrowAssets, 0n, …)`. Morpho rejects a borrow
  // with both amounts zero, so we require a positive overshoot from the caller (the entity
  // computes one from `slippageTolerance`; direct callers must do the same).
  if (sharesMode && borrowAssets <= 0n) {
    throw new RefinanceSharesMissingBorrowAssetsError(sourceParams.id);
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

  callback.push({
    type: "morphoWithdrawCollateral",
    args: [sourceParams, collateralAmount, generalAdapter1, false],
  });

  // Shares mode overshoots the target borrow to cover accrual + slippage; sweep the residual
  // into the target debt so GA1 finishes drained. `assets=maxUint256` pulls the full GA1
  // balance, `maxSharePrice=maxUint256` disables slippage (intra-tx, no manipulation surface),
  // `skipRevert=true` is safe if the residual is zero.
  if (sharesMode) {
    callback.push({
      type: "morphoRepay",
      args: [targetParams, maxUint256, 0n, maxUint256, user, [], true],
    });
  }

  const actions: Action[] = [
    {
      type: "morphoSupplyCollateral",
      args: [targetParams, collateralAmount, user, callback, false],
    },
  ];

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "marketV1Refinance",
      args: {
        sourceMarket: sourceParams.id,
        targetMarket: targetParams.id,
        collateralAmount,
        borrowAssets,
        borrowShares,
        minBorrowSharePrice,
        maxRepaySharePrice,
        user,
      },
    },
  });
};

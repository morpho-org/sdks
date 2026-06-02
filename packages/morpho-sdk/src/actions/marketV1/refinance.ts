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
  NonPositiveRepayMaxSharePriceError,
  RefinanceSameMarketError,
  RefinanceSharesMissingBorrowAssetsError,
  RefinanceTokenMismatchError,
  type Transaction,
  type VaultReallocation,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { buildReallocationActions } from "./buildReallocationActions.js";

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
    /**
     * Loan assets to borrow on the target market. In **assets mode** this is the user-meaningful
     * exact-asset borrow and is mutually exclusive with `borrowShares`. In **shares mode** this
     * MUST also be set to the positive overshoot amount that covers projected accrual + slippage
     * on the target borrow leg (the entity layer computes this from `slippageTolerance`).
     * Omitting it in shares mode throws {@link RefinanceSharesMissingBorrowAssetsError}.
     */
    borrowAssets?: bigint;
    /**
     * Source borrow shares to repay (immune to mid-tx accrual). In shares mode this is the
     * user-meaningful exact-share repay; `borrowAssets` must additionally be set to the
     * overshoot for the target borrow leg.
     */
    borrowShares?: bigint;
    /** Minimum borrow share price on the target market (in ray). */
    minBorrowSharePrice: bigint;
    /**
     * Maximum repay share price on the source market (in ray). Required to be > 0 whenever a
     * repay leg is encoded (`borrowAssets > 0n` or `borrowShares > 0n`); the zero sentinel is
     * only valid in collat-only refinances.
     */
    maxRepaySharePrice: bigint;
    /**
     * Optional PublicAllocator reallocations into the target market, executed before the refinance
     * bundle so the in-callback target borrow finds on-chain liquidity. Fees accumulate in
     * `tx.value`.
     */
    targetReallocations?: readonly VaultReallocation[];
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
 * // optional — when `targetReallocations` is non-empty, one `reallocateTo` per
 * // entry runs first to free up liquidity on the target market.
 * reallocateTo(vault_i, fee_i, withdrawals_i, target, false),
 * ...
 *
 * morphoSupplyCollateral(target, collateralAmount, user, [
 *   // omitted when no debt is migrated (collat-only refinance)
 *   morphoBorrow(target, borrowAssets, 0, minBorrowSharePrice, GA1),
 *   morphoRepay(source, assets|0, 0|shares, maxRepaySharePrice, user, []),
 *
 *   // shares mode only — sweeps loan-token overshoot back into the target debt BEFORE
 *   // the collateral withdrawal so same-token markets (loan === collat) aren't drained.
 *   morphoRepay(target, maxUint256, 0, maxUint256, user, [], skipRevert=true),
 *
 *   morphoWithdrawCollateral(source, collateralAmount, GA1),
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
 * @param params.args.targetReallocations - Optional PublicAllocator reallocations into the target
 *   market. Encoded as `reallocateTo` calls before the supply leg. Fees accumulate in `tx.value`.
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
 * @throws {NonPositiveRepayMaxSharePriceError} when a repay leg is encoded
 *   (`borrowAssets > 0n` or `borrowShares > 0n`) and `maxRepaySharePrice <= 0n` — an on-chain
 *   `morphoRepay` with a zero cap is doomed to revert.
 * @throws {NegativeReallocationFeeError} from `buildReallocationActions` when
 *   `targetReallocations` is non-empty and any `reallocation.fee < 0n`.
 * @throws {EmptyReallocationWithdrawalsError} from `buildReallocationActions` when any
 *   `reallocation.withdrawals` is empty.
 * @throws {NonPositiveReallocationAmountError} from `buildReallocationActions` when any
 *   `reallocation.withdrawals[i].amount <= 0n`.
 * @throws {ReallocationWithdrawalOnTargetMarketError} from `buildReallocationActions` when any
 *   reallocation withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} from `buildReallocationActions` when
 *   reallocation withdrawals are not strictly sorted by market id.
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
    targetReallocations,
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

  // When a repay leg is encoded, `maxRepaySharePrice = 0n` is doomed to revert on-chain
  // (actual share price > 0). Match the existing `marketV1Repay` / `marketV1RepayWithdrawCollateral`
  // contract by requiring a positive cap whenever debt is migrated. The zero sentinel remains
  // legal in collat-only refinances (where the repay leg is omitted).
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

  // Shares mode overshoots the target borrow to cover accrual + slippage; sweep the loan-token
  // residual into the target debt so GA1 finishes drained of loan tokens. `assets=maxUint256`
  // pulls the full GA1 loan-token balance, `maxSharePrice=maxUint256` disables slippage
  // (intra-tx, no manipulation surface), `skipRevert=true` is safe if the residual is zero.
  //
  // The sweep MUST run before `morphoWithdrawCollateral` — otherwise, in a same-token market
  // (`loanToken === collateralToken`), `maxUint256` would also consume the just-withdrawn
  // collateral that the outer `morphoSupplyCollateral`'s deferred `safeTransferFrom` still
  // needs to pull, reverting the whole bundle.
  if (sharesMode) {
    callback.push({
      type: "morphoRepay",
      args: [targetParams, maxUint256, 0n, maxUint256, user, [], true],
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
        reallocationFee,
      },
    },
  });
};

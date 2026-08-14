import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type AuthorizationRequirementSignature,
  type BlueReallocation,
  type BlueRefinanceAction,
  type Metadata,
  NegativeInputError,
  NonPositiveInputError,
  RefinanceSameMarketError,
  RefinanceSharesMissingBorrowAssetsError,
  RefinanceTokenMismatchError,
  type Transaction,
} from "../../types/index.js";
import { getBlueAuthorizationAction } from "../signatures/getBlueAuthorizationAction.js";
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
    /** Address whose position is refinanced from the source to the target market. */
    user: Address;
    /** Amount of collateral moved from the source market to the target market. */
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
    /** Public Allocator V1 or V2 reallocations into the target market, run before the supply leg. */
    targetReallocations?: readonly BlueReallocation[];
    /**
     * Optional signed Morpho authorization. When provided, a `setAuthorizationWithSig` call is
     * prepended to the bundle so GeneralAdapter1 is authorized in-bundle instead of via a
     * standalone `setAuthorization` transaction.
     */
    authorizationSignature?: AuthorizationRequirementSignature;
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
 * // optional targetReallocations run first:
 * reallocateTo(...) | reallocate(...) | allocateFromIdle(...),
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
 * @param params.args.targetReallocations - Public Allocator V1 or V2 reallocations into the target,
 *   run before the supply leg. V1 fees add to `tx.value`; V2 penalties are paid in the target loan token.
 * @param params.args.authorizationSignature - Optional signed Morpho authorization; when present,
 *   a `setAuthorizationWithSig` call is prepended to the bundle.
 * @param params.metadata - Optional analytics metadata appended to `tx.data`.
 * @returns A deep-frozen `Transaction<BlueRefinanceAction>`.
 * @remarks `borrowAssets` and `borrowShares` describe different markets (target borrow vs. source
 * repay); in shares mode the entity passes both. Caller-facing mutual exclusivity is enforced at the entity layer.
 * @throws {NonPositiveInputError} when `collateralAmount <= 0n`, a repay leg has a non-positive
 *   `maxRepaySharePrice`, or any reallocation withdrawal amount is non-positive.
 * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
 * @throws {InconsistentReallocationPenaltyError} when V2 entries for one allocator-vault pair use different penalties.
 * @throws {InvalidReallocationAddressError} when a V2 identity or adapter address is malformed.
 * @throws {InvalidReallocationSourceTypeError} when a V2 source is absent, incomplete, or has an unknown discriminator.
 * @throws {InvalidReallocationTypeError} when a top-level reallocation variant is unknown.
 * @throws {NegativeInputError} when `borrowAssets`, `borrowShares`, `minBorrowSharePrice`,
 *   `maxRepaySharePrice`, a V1 fee, or a V2 penalty is negative.
 * @throws {RefinanceSameMarketError} when source and target market ids are equal.
 * @throws {RefinanceTokenMismatchError} when source and target do not share both tokens.
 * @throws {RefinanceSharesMissingBorrowAssetsError} when `borrowShares > 0n` but `borrowAssets` is omitted or non-positive.
 * @throws {EmptyReallocationWithdrawalsError} when any `reallocation.withdrawals` is empty.
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
    authorizationSignature,
  },
  metadata,
}: BlueRefinanceParams): Readonly<Transaction<BlueRefinanceAction>> => {
  if (collateralAmount <= 0n) {
    throw new NonPositiveInputError("collateralAmount", collateralAmount);
  }

  if (borrowAssets < 0n) {
    throw new NegativeInputError("borrowAssets", borrowAssets);
  }

  if (borrowShares < 0n) {
    throw new NegativeInputError("borrowShares", borrowShares);
  }

  if (minBorrowSharePrice < 0n) {
    throw new NegativeInputError("minBorrowSharePrice", minBorrowSharePrice);
  }

  if (maxRepaySharePrice < 0n) {
    throw new NegativeInputError("maxRepaySharePrice", maxRepaySharePrice);
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
    throw new NonPositiveInputError("maxRepaySharePrice", maxRepaySharePrice);
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
  let reallocationPenaltyAssets = 0n;

  if (authorizationSignature) {
    actions.push(getBlueAuthorizationAction(chainId, authorizationSignature));
  }

  if (targetReallocations && targetReallocations.length > 0) {
    const result = buildReallocationActions({
      chainId,
      reallocations: targetReallocations,
      targetMarketParams: targetParams,
    });
    actions.push(...result.actions);
    reallocationFee = result.fee;
    reallocationPenaltyAssets = result.penaltyAssets;
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
        reallocationPenaltyAssets,
      },
    },
  });
};

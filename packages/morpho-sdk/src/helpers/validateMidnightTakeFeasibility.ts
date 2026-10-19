import { MathLib } from "@morpho-org/blue-sdk";
import {
  MAX_TICK,
  type Market,
  MarketUtils,
  type OfferStruct,
  SETTLEMENT_FEE_BREAKPOINTS,
  TickLib,
} from "@morpho-org/midnight-sdk";
import { type Address, isAddressEqual, maxUint256, zeroAddress } from "viem";
import {
  ExpiredDeadlineError,
  type MidnightBuyTarget,
  MidnightContinuousFeeAboveMaxError,
  MidnightRepayExceedsDebtError,
  type MidnightSellTarget,
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
} from "../types/index.js";
import { grossFromNetAssets } from "./referralFee.js";

/** Takeable-offer fields the check reads, so helpers stay independent of the actions layer. */
type TakeableOfferLike = {
  readonly units: bigint;
  readonly offer: OfferStruct;
};

const netOfReferralFee = (assets: bigint, referralFeePct: bigint) =>
  assets - MathLib.mulDivDown(assets, referralFeePct, MathLib.WAD);

/**
 * Rejects `MidnightBundlesV2` sell targets that no offer can satisfy.
 *
 * A Midnight unit sells for at most one loan asset, so a units target yields at most `units` minus
 * the referral fee, and an assets target needs at least `assets` plus the referral fee in units.
 *
 * @param params - Sell target and validated referral fee.
 * @param params.target - Sell target of `takeBorrow`, `takeWithdraw` or `supplyCollateralTakeBorrow`.
 * @param params.referralFeePct - WAD-scaled referral fee, already checked to be below WAD.
 * @returns Nothing when the target is reachable at some price.
 * @throws {MidnightTakeTargetUnreachableError} when `target.minSellerAssets` exceeds the most the
 *   units can yield, or `target.maxUnits` is below the units the assets need.
 * @internal
 */
export const validateMidnightSellTargetBounds = (params: {
  readonly target: MidnightSellTarget;
  readonly referralFeePct: bigint;
}): void => {
  const { target, referralFeePct } = params;
  if (target.type === "units") {
    const maxSellerAssets = netOfReferralFee(target.units, referralFeePct);
    if (target.minSellerAssets > maxSellerAssets) {
      throw new MidnightTakeTargetUnreachableError({
        field: "target.minSellerAssets",
        value: target.minSellerAssets,
        limit: maxSellerAssets,
      });
    }
    return;
  }
  // MidnightBundlesV2 grosses the received assets up by the referral fee before filling.
  const minUnits = grossFromNetAssets({
    netAssets: target.assets,
    referralFeePct,
  });
  if (target.maxUnits < minUnits) {
    throw new MidnightTakeTargetUnreachableError({
      field: "target.maxUnits",
      value: target.maxUnits,
      limit: minUnits,
    });
  }
};

/**
 * Inputs shared by the Midnight entity take flows' feasibility check.
 *
 * @internal
 */
export type MidnightTakeFeasibilityParams<
  T extends TakeableOfferLike = TakeableOfferLike,
> = {
  /** Offers supplied by the caller. */
  readonly takeableOffers: readonly T[];
  /** Taker; it sends the transaction, so offers it made are self-takes. */
  readonly accountAddress: Address;
  /** Market snapshot used for maturity, continuous fee and settlement fees. */
  readonly marketData: Market;
  /** Current timestamp in seconds. */
  readonly now: bigint;
  /** Bundle deadline in seconds. */
  readonly deadline: bigint;
  /** WAD-scaled referral fee, already checked to be below WAD. */
  readonly referralFeePct: bigint;
  /**
   * Units the bundle fills without offers: withdrawn credit for sells, the direct repay at par for
   * buys with `repayEnabled`. Use an upper bound.
   */
  readonly fallbackUnits: bigint;
} & (
  | {
      /** Taker buys units from sell offers (`takeLend`, `takeRepayWithdrawCollateral`). */
      readonly side: "buy";
      readonly target: MidnightBuyTarget;
      /** Largest market continuous fee the caller accepts. */
      readonly maxContinuousFee: bigint;
      /**
       * Debt from the position snapshot for a reduce-only repay; the target may not exceed it, and a
       * `units: maxUint256` target resolves to it.
       */
      readonly debt?: bigint;
    }
  | {
      /** Taker sells units to buy offers (`takeBorrow`, `takeWithdraw`, `supplyCollateralTakeBorrow`). */
      readonly side: "sell";
      readonly target: MidnightSellTarget;
      /** Whether offer fills open debt for the taker, which Midnight blocks after maturity. */
      readonly increasesDebt: boolean;
      /**
       * Taker credit from the position snapshot. After maturity, debt-opening offer fills can only
       * sell the credit left after the fallback withdrawal.
       */
      readonly credit?: bigint;
    }
);

/**
 * Rejects Midnight entity takes that `MidnightBundlesV2` would revert, and drops offers that can
 * only abort the bundle.
 *
 * `MidnightBundlesV2` skips an offer whose take reverts, so a dead offer only matters when no other
 * offer or fallback can fill the target. An offer is dead when it is expired, cannot start before
 * `deadline`, was made by `accountAddress`, has a `continuousFeeCap` below the market fee, carries
 * zero units, has a tick outside `[0, MAX_TICK]`, is a buy offer with a non-zero
 * `receiverIfMakerIsSeller`, or opens debt after maturity once the withdrawal used all the taker's
 * credit. Some offers revert the whole bundle before the take, so they are removed instead: on a
 * buy assets target, a sell offer whose tick is out of range or whose buyer price is zero or above
 * one at every time up to `deadline`; on any sell, a buy offer whose tick is out of range, whose
 * price is zero, or whose price is below the settlement fee (at or below it on an assets target) at every
 * time up to `deadline`.
 *
 * @param params - Offers, taker, market snapshot, clock, target and fallback.
 * @returns `params.takeableOffers` itself, or a copy without the removed offers.
 * @throws {ExpiredDeadlineError} when `deadline` is not after `now`.
 * @throws {MidnightContinuousFeeAboveMaxError} when a buy's `maxContinuousFee` is below the market
 *   continuous fee.
 * @throws {MidnightRepayExceedsDebtError} when a reduce-only repay target exceeds `debt`.
 * @throws {MidnightTakeableOffersNotFillableError} when every offer is dead and the flow has no
 *   fallback, or every offer would abort the bundle.
 * @throws {MidnightTakeTargetUnreachableError} when the live offers plus the fallback cannot hold
 *   the target's units or a buy assets target's `minUnits`, or a buy units target's
 *   `maxBuyerAssets` is below its minimum cost.
 * @internal
 */
export const validateMidnightTakeFeasibility = <T extends TakeableOfferLike>(
  params: MidnightTakeFeasibilityParams<T>,
): readonly T[] => {
  // The raw builder rejects an empty list with `EmptyMidnightTakeableOffersError`.
  if (params.takeableOffers.length === 0) return params.takeableOffers;
  const { marketData, now, deadline, referralFeePct, target } = params;
  // The entity checked the deadline on an earlier clock read; recheck so the fee window is never empty.
  if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
  const maturity = marketData.params.maturity;
  const marketFee = BigInt(marketData.continuousFee);
  if (params.side === "buy") {
    if (params.maxContinuousFee < marketFee) {
      throw new MidnightContinuousFeeAboveMaxError({
        maxContinuousFee: params.maxContinuousFee,
        continuousFee: marketFee,
      });
    }
    const { debt, target: buyTarget } = params;
    if (debt !== undefined) {
      // Reduce-only buys fill at most the debt, and an assets target pays at most one asset per unit.
      const repay =
        buyTarget.type === "units"
          ? buyTarget.units === maxUint256
            ? undefined
            : { field: "target.units" as const, value: buyTarget.units }
          : buyTarget.minUnits > debt
            ? {
                field: "target.minUnits" as const,
                value: buyTarget.minUnits,
              }
            : {
                field: "target.assets" as const,
                value: netOfReferralFee(buyTarget.assets, referralFeePct),
              };
      if (repay && repay.value > debt) {
        throw new MidnightRepayExceedsDebtError({ ...repay, debt });
      }
    }
  }
  const fees = [
    maturity - deadline,
    maturity - now,
    ...SETTLEMENT_FEE_BREAKPOINTS,
  ]
    .filter((ttm) => ttm >= maturity - deadline && ttm <= maturity - now)
    .map((ttm) =>
      MarketUtils.getSettlementFee({
        settlementFeeCbps: marketData.settlementFeeCbps,
        timeToMaturity: MathLib.max(ttm, 0n),
      }),
    );
  const minFee = MathLib.min(...fees);
  const maxFee = MathLib.max(...fees);

  const dead: MidnightTakeableOffersNotFillableError["offers"][number][] = [];
  const removed = new Set<number>();
  // Post-maturity sells cannot open debt, so offers only take the credit left after the withdrawal.
  const sellableCredit =
    params.side === "sell" && params.increasesDebt && now > maturity
      ? MathLib.zeroFloorSub(params.credit ?? 0n, params.fallbackUnits)
      : undefined;
  let liveUnits = 0n;
  let minBuyerPrice = params.fallbackUnits > 0n ? MathLib.WAD : maxUint256;
  for (const [index, { units, offer }] of params.takeableOffers.entries()) {
    const tickInRange = offer.tick >= 0n && offer.tick <= MAX_TICK;
    const offerPrice = tickInRange ? TickLib.tickToPrice(offer.tick) : 0n;
    let reason:
      | MidnightTakeableOffersNotFillableError["offers"][number]["reason"]
      | undefined;
    // The bundle converts every buy assets target price outside its per-offer catch,
    // so a degenerate price aborts the bundle even when the offer is otherwise dead.
    if (params.side === "buy" && target.type === "assets") {
      if (!tickInRange) reason = "tickOutOfRange";
      else if (offerPrice + maxFee === 0n) reason = "zeroBuyerPrice";
      else if (offerPrice + minFee > MathLib.WAD) reason = "buyerPriceAboveOne";
      if (reason) removed.add(index);
    }
    // Every sell converts a buy offer's price outside the catch too, which underflows below the fee.
    if (params.side === "sell") {
      if (!tickInRange) reason = "tickOutOfRange";
      else if (offerPrice === 0n) reason = "zeroBuyerPrice";
      // An assets target also divides by the seller price, which is zero at the fee.
      else if (
        offerPrice < minFee ||
        (target.type === "assets" && offerPrice === minFee)
      )
        reason = "priceBelowSettlementFee";
      if (reason) removed.add(index);
    }
    if (!reason) {
      if (units === 0n) reason = "zeroUnits";
      else if (!tickInRange) reason = "tickOutOfRange";
      else if (offer.expiry < now) reason = "expired";
      else if (offer.start > deadline) reason = "notStarted";
      else if (isAddressEqual(offer.maker, params.accountAddress))
        reason = "selfTake";
      else if (offer.continuousFeeCap < marketFee)
        reason = "continuousFeeCapBelowMarketFee";
      else if (
        params.side === "sell" &&
        !isAddressEqual(offer.receiverIfMakerIsSeller, zeroAddress)
      )
        reason = "receiverIfMakerIsSellerNotZero";
      else if (sellableCredit === 0n) reason = "marketMatured";
    }
    if (reason) {
      dead.push({ index, reason });
      continue;
    }
    liveUnits += units;
    minBuyerPrice = MathLib.min(minBuyerPrice, offerPrice + minFee);
  }

  if (
    dead.length === params.takeableOffers.length &&
    (params.fallbackUnits === 0n || removed.size === dead.length)
  ) {
    throw new MidnightTakeableOffersNotFillableError(dead);
  }

  const requiredUnits =
    params.side === "sell"
      ? target.type === "units"
        ? target.units
        : grossFromNetAssets({ netAssets: target.assets, referralFeePct })
      : params.target.type === "units"
        ? params.target.units === maxUint256
          ? (params.debt ?? 0n)
          : params.target.units
        : MathLib.max(
            netOfReferralFee(params.target.assets, referralFeePct),
            params.target.minUnits,
          );
  const fillableUnits =
    (sellableCredit === undefined
      ? liveUnits
      : MathLib.min(liveUnits, sellableCredit)) + params.fallbackUnits;
  if (fillableUnits < requiredUnits) {
    throw new MidnightTakeTargetUnreachableError({
      field: "takeableOffers",
      value: fillableUnits,
      limit: requiredUnits,
    });
  }

  if (params.side === "buy" && params.target.type === "units") {
    // Every unit costs at least the cheapest live price, and the fee is grossed up on top.
    const minCost = MathLib.mulDivDown(
      requiredUnits,
      minBuyerPrice,
      MathLib.WAD,
    );
    const minPull = grossFromNetAssets({ netAssets: minCost, referralFeePct });
    if (params.target.maxBuyerAssets < minPull) {
      throw new MidnightTakeTargetUnreachableError({
        field: "target.maxBuyerAssets",
        value: params.target.maxBuyerAssets,
        limit: minPull,
      });
    }
  }

  return removed.size === 0
    ? params.takeableOffers
    : params.takeableOffers.filter((_, index) => !removed.has(index));
};

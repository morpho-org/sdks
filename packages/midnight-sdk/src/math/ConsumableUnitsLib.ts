import {
  assertNonNegative,
  type BigIntish,
  MathLib,
} from "@morpho-org/morpho-ts";

import { OfferUtils } from "../offers/index.js";
import { TakeAmountsLib } from "./TakeAmountsLib.js";

/**
 * Computes units consumable through Midnight `take`.
 *
 * @example
 * ```ts
 * import { ConsumableUnitsLib } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof ConsumableUnitsLib.consumableUnits);
 * ```
 */
export namespace ConsumableUnitsLib {
  /**
   * Returns the maximum units accepted by an offer's cap.
   *
   * @param params.offer.buy - Whether the maker buys loan assets.
   * @param params.offer.tick - Offer tick used for asset-capped conversion.
   * @param params.offer.maxUnits - Unit cap; when non-zero, units are capped directly.
   * @param params.offer.maxAssets - Asset cap used when `params.offer.maxUnits` is zero.
   * @param params.consumed - Amount already consumed from the offer group.
   * @param params.settlementFee - WAD-scaled settlement fee used for asset-capped conversion.
   * @returns Remaining consumable units accepted by Midnight `take`.
   * @throws {NegativeValueError} when `consumed`, offer limits, delegated asset inputs, or the offer tick is negative.
   * @throws {InvalidOfferParameterError} when offer caps are both zero or both non-zero.
   * @throws {TickOutOfRangeError} when the offer tick exceeds `MAX_TICK`.
   * @throws {SettlementFeeExceedsPriceError} when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { ConsumableUnitsLib } from "@morpho-org/midnight-sdk";
   *
   * const offer = {
   *   buy: true,
   *   tick: 5_820n,
   *   maxUnits: 0n,
   *   maxAssets: 1_000n,
   * };
   *
   * const units = ConsumableUnitsLib.consumableUnits({
   *   offer,
   *   consumed: 0n,
   *   settlementFee: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function consumableUnits(params: {
    readonly offer: {
      readonly buy: boolean;
      readonly tick: BigIntish;
      readonly maxUnits: BigIntish;
      readonly maxAssets: BigIntish;
    };
    readonly consumed: BigIntish;
    readonly settlementFee: BigIntish;
  }) {
    const consumed = BigInt(params.consumed);
    const maxUnits = BigInt(params.offer.maxUnits);
    const maxAssets = BigInt(params.offer.maxAssets);
    assertNonNegative("consumed", consumed);
    assertNonNegative("offer.maxUnits", maxUnits);
    assertNonNegative("offer.maxAssets", maxAssets);
    OfferUtils.validateOfferCaps({ maxUnits, maxAssets });

    if (maxUnits > 0n) return MathLib.zeroFloorSub(maxUnits, consumed);

    const remainingAssets = MathLib.zeroFloorSub(maxAssets, consumed);
    if (!params.offer.buy) {
      const { sellerPrice } = TakeAmountsLib.prices({
        offer: params.offer,
        settlementFee: params.settlementFee,
      });
      if (sellerPrice === 0n) return MathLib.MAX_UINT_256;

      return MathLib.mulDivDown(remainingAssets, MathLib.WAD, sellerPrice);
    }

    const { buyerPrice } = TakeAmountsLib.prices({
      offer: params.offer,
      settlementFee: params.settlementFee,
    });
    if (buyerPrice === 0n) return MathLib.MAX_UINT_256;

    return ((remainingAssets + 1n) * MathLib.WAD - 1n) / buyerPrice;
  }
}

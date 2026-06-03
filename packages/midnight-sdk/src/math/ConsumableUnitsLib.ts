import { MathLib } from "@morpho-org/morpho-ts";

import { assertNonNegative } from "../internal.js";
import { type IOffer, normalizeOffer, type Offer } from "../offers/index.js";
import type { BigIntish } from "../types.js";
import { TakeAmountsLib } from "./TakeAmountsLib.js";

/**
 * TypeScript port of Midnight `ConsumableUnitsLib`.
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
   * Returns units that would fully consume an offer.
   *
   * @param params - Consumption parameters.
   * @returns Remaining consumable units.
   * @throws NegativeValueError when `consumed`, offer limits, or delegated asset inputs are negative.
   * @throws DivisionByZeroError when the delegated units conversion divides by zero.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { ConsumableUnitsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = ConsumableUnitsLib.consumableUnits({
   *   offer: {} as never,
   *   consumed: 0n,
   *   settlementFee: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function consumableUnits(params: {
    readonly offer: IOffer | Offer;
    readonly consumed: BigIntish;
    readonly settlementFee: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const consumed = BigInt(params.consumed);
    assertNonNegative("consumed", consumed);
    assertNonNegative("offer.maxUnits", offer.maxUnits);
    assertNonNegative("offer.maxAssets", offer.maxAssets);

    if (offer.maxUnits > 0n)
      return MathLib.zeroFloorSub(offer.maxUnits, consumed);

    const maxAssets = MathLib.zeroFloorSub(offer.maxAssets, consumed);
    return offer.buy
      ? TakeAmountsLib.buyerAssetsToUnits({
          offer,
          targetBuyerAssets: maxAssets,
          settlementFee: params.settlementFee,
        })
      : TakeAmountsLib.sellerAssetsToUnits({
          offer,
          targetSellerAssets: maxAssets,
          settlementFee: params.settlementFee,
        });
  }
}

import { zeroFloorSub } from "@morpho-org/morpho-ts";

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
   * @example
   * ```ts
   * import { ConsumableUnitsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = ConsumableUnitsLib.consumableUnits({
   *   offer: {} as never,
   *   consumed: 0n,
   *   settlementFee: 0n,
   *   now: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function consumableUnits(params: {
    readonly offer: IOffer | Offer;
    readonly consumed: BigIntish;
    readonly settlementFee: BigIntish;
    readonly now: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const consumed = BigInt(params.consumed);

    if (offer.maxUnits > 0n) return zeroFloorSub(offer.maxUnits, consumed);

    const maxAssets = zeroFloorSub(offer.maxAssets, consumed);
    return offer.buy
      ? TakeAmountsLib.buyerAssetsToUnits({
          offer,
          targetBuyerAssets: maxAssets,
          settlementFee: params.settlementFee,
          now: params.now,
        })
      : TakeAmountsLib.sellerAssetsToUnits({
          offer,
          targetSellerAssets: maxAssets,
          settlementFee: params.settlementFee,
          now: params.now,
        });
  }
}

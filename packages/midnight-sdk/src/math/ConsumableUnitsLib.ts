import {
  assertNonNegative,
  type BigIntish,
  MathLib,
} from "@morpho-org/morpho-ts";

import type { IOffer, Offer } from "../offers/index.js";
import { normalizeOffer } from "../offers/Offer.js";
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
   * @throws NegativeValueError when `consumed`, offer limits, delegated asset inputs, or the offer tick is negative.
   * @throws DivisionByZeroError when the delegated units conversion divides by zero.
   * @throws TickOutOfRangeError when the offer tick exceeds `MAX_TICK`.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { ConsumableUnitsLib, type IOffer } from "@morpho-org/midnight-sdk";
   *
   * const offer = {
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000000001",
   *     collateralParams: [],
   *     maturity: 1_735_689_600n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000000002",
   *   start: 0n,
   *   expiry: 1_735_603_200n,
   *   tick: 5_820n,
   *   group: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   callback: "0x0000000000000000000000000000000000000000",
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000002",
   *   ratifier: "0x0000000000000000000000000000000000000003",
   *   reduceOnly: false,
   *   maxUnits: 0n,
   *   maxAssets: 1_000n,
   * } satisfies IOffer;
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

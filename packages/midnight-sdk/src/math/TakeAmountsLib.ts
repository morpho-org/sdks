import { MathLib, type RoundingDirection } from "@morpho-org/morpho-ts";

import {
  DivisionByZeroError,
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { type IOffer, normalizeOffer, type Offer } from "../offers/index.js";
import type { BigIntish } from "../types.js";
import { TickLib } from "./TickLib.js";

// biome-ignore lint/complexity/useMaxParams: Internal dispatcher for Solidity-style rounding helpers.
const mulDiv = (
  x: bigint,
  y: bigint,
  denominator: bigint,
  rounding: RoundingDirection,
) =>
  rounding === "Up"
    ? MathLib.mulDivUp(x, y, denominator)
    : MathLib.mulDivDown(x, y, denominator);

const prices = (offer: Offer, settlementFee: bigint) => {
  const offerPrice = TickLib.tickToPrice(offer.tick);
  if (offer.buy && offerPrice < settlementFee) {
    throw new SettlementFeeExceedsPriceError(settlementFee, offerPrice);
  }
  const sellerPrice = offer.buy ? offerPrice - settlementFee : offerPrice;
  const buyerPrice = sellerPrice + settlementFee;

  return { buyerPrice, sellerPrice };
};

/**
 * TypeScript port of Midnight `TakeAmountsLib`.
 *
 * @example
 * ```ts
 * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof TakeAmountsLib.toUnits);
 * ```
 */
export namespace TakeAmountsLib {
  /**
   * Converts a target buyer-asset amount into units for an offer.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target buyer assets where reachable.
   * @throws DivisionByZeroError when the computed buyer price is zero.
   * @throws PriceGreaterThanOneError when buyer price is above WAD.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = TakeAmountsLib.buyerAssetsToUnits({
   *   offer: {} as never,
   *   targetBuyerAssets: 100n,
   *   settlementFee: 0n,
   *   now: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function buyerAssetsToUnits(params: {
    readonly offer: IOffer | Offer;
    readonly targetBuyerAssets: BigIntish;
    readonly settlementFee: BigIntish;
    readonly now: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    const targetBuyerAssets = BigInt(params.targetBuyerAssets);
    const { buyerPrice } = prices(offer, settlementFee);
    if (buyerPrice === 0n) throw new DivisionByZeroError("buyerPrice");
    if (buyerPrice > MathLib.WAD)
      throw new PriceGreaterThanOneError(buyerPrice);

    return offer.buy
      ? MathLib.mulDivUp(targetBuyerAssets, MathLib.WAD, buyerPrice)
      : MathLib.mulDivDown(targetBuyerAssets, MathLib.WAD, buyerPrice);
  }

  /**
   * Converts a target seller-asset amount into units for an offer.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target seller assets where reachable.
   * @throws DivisionByZeroError when the computed seller price is zero.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = TakeAmountsLib.sellerAssetsToUnits({
   *   offer: {} as never,
   *   targetSellerAssets: 100n,
   *   settlementFee: 0n,
   *   now: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function sellerAssetsToUnits(params: {
    readonly offer: IOffer | Offer;
    readonly targetSellerAssets: BigIntish;
    readonly settlementFee: BigIntish;
    readonly now: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    const targetSellerAssets = BigInt(params.targetSellerAssets);
    const { sellerPrice } = prices(offer, settlementFee);
    if (sellerPrice === 0n) throw new DivisionByZeroError("sellerPrice");

    return offer.buy
      ? MathLib.mulDivUp(targetSellerAssets, MathLib.WAD, sellerPrice)
      : MathLib.mulDivDown(targetSellerAssets, MathLib.WAD, sellerPrice);
  }

  /**
   * Converts assets to units at a WAD price.
   *
   * @param params - Generic conversion parameters.
   * @returns Units.
   * @throws DivisionByZeroError when price is zero.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/morpho-ts";
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = TakeAmountsLib.toUnits({ assets: 100n, price: MathLib.WAD, rounding: "Down" });
   * console.log(units);
   * ```
   */
  export function toUnits(params: {
    readonly assets: BigIntish;
    readonly price: BigIntish;
    readonly rounding: RoundingDirection;
  }) {
    const price = BigInt(params.price);
    if (price === 0n) throw new DivisionByZeroError("price");

    return mulDiv(BigInt(params.assets), MathLib.WAD, price, params.rounding);
  }

  /**
   * Converts assets to units at a tick price.
   *
   * @param params - Tick conversion parameters.
   * @returns Units.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = TakeAmountsLib.toUnitsAtTick({ assets: 100n, tick: 5820n, rounding: "Down" });
   * console.log(units);
   * ```
   */
  export function toUnitsAtTick(params: {
    readonly assets: BigIntish;
    readonly tick: BigIntish;
    readonly rounding: RoundingDirection;
  }) {
    return toUnits({
      assets: params.assets,
      price: TickLib.tickToPrice(params.tick),
      rounding: params.rounding,
    });
  }
}

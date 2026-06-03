import { MathLib, type RoundingDirection } from "@morpho-org/morpho-ts";

import {
  DivisionByZeroError,
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { assertNonNegative } from "../internal.js";
import { type IOffer, normalizeOffer, type Offer } from "../offers/index.js";
import type { BigIntish } from "../types.js";
import { TickLib } from "./TickLib.js";

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
   * Dispatches to the selected `MathLib.mulDiv` rounding direction.
   *
   * @param params - Multiplication/division parameters.
   * @returns `x * y / denominator` with the requested rounding direction.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const units = TakeAmountsLib.mulDiv({ x: 5n, y: 1n, denominator: 2n, rounding: "Up" });
   * console.log(units);
   * ```
   */
  export function mulDiv(params: {
    readonly x: bigint;
    readonly y: bigint;
    readonly denominator: bigint;
    readonly rounding: RoundingDirection;
  }) {
    return params.rounding === "Up"
      ? MathLib.mulDivUp(params.x, params.y, params.denominator)
      : MathLib.mulDivDown(params.x, params.y, params.denominator);
  }

  /**
   * Computes buyer and seller prices for an offer and settlement fee.
   *
   * @param params - Price parameters.
   * @returns Buyer and seller prices.
   * @throws NegativeValueError when `settlementFee` is negative.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const prices = TakeAmountsLib.prices({ offer: {} as never, settlementFee: 0n });
   * console.log(prices.buyerPrice);
   * ```
   */
  export function prices(params: {
    readonly offer: IOffer | Offer;
    readonly settlementFee: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    assertNonNegative("settlementFee", settlementFee);

    const offerPrice = TickLib.tickToPrice(offer.tick);
    if (offer.buy && offerPrice < settlementFee) {
      throw new SettlementFeeExceedsPriceError(settlementFee, offerPrice);
    }
    const sellerPrice = offer.buy ? offerPrice - settlementFee : offerPrice;
    const buyerPrice = sellerPrice + settlementFee;

    return { buyerPrice, sellerPrice } as const;
  }

  /**
   * Converts a target buyer-asset amount into units for an offer.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target buyer assets where reachable.
   * @throws NegativeValueError when `targetBuyerAssets` or `settlementFee` is negative.
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
   * });
   * console.log(units);
   * ```
   */
  export function buyerAssetsToUnits(params: {
    readonly offer: IOffer | Offer;
    readonly targetBuyerAssets: BigIntish;
    readonly settlementFee: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    const targetBuyerAssets = BigInt(params.targetBuyerAssets);
    assertNonNegative("targetBuyerAssets", targetBuyerAssets);

    const { buyerPrice } = prices({ offer, settlementFee });
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
   * @throws NegativeValueError when `targetSellerAssets` or `settlementFee` is negative.
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
   * });
   * console.log(units);
   * ```
   */
  export function sellerAssetsToUnits(params: {
    readonly offer: IOffer | Offer;
    readonly targetSellerAssets: BigIntish;
    readonly settlementFee: BigIntish;
  }) {
    const offer = normalizeOffer(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    const targetSellerAssets = BigInt(params.targetSellerAssets);
    assertNonNegative("targetSellerAssets", targetSellerAssets);

    const { sellerPrice } = prices({ offer, settlementFee });
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
   * @throws NegativeValueError when `assets` or `price` is negative.
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
    const assets = BigInt(params.assets);
    const price = BigInt(params.price);
    assertNonNegative("assets", assets);
    assertNonNegative("price", price);
    if (price === 0n) throw new DivisionByZeroError("price");

    return mulDiv({
      x: assets,
      y: MathLib.WAD,
      denominator: price,
      rounding: params.rounding,
    });
  }

  /**
   * Converts assets to units at a tick price.
   *
   * @param params - Tick conversion parameters.
   * @returns Units.
   * @throws NegativeValueError when `assets` or `tick` is negative.
   * @throws DivisionByZeroError when the tick price is zero.
   * @throws TickOutOfRangeError when `tick` exceeds `MAX_TICK`.
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

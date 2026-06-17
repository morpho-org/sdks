import {
  assertNonNegative,
  type BigIntish,
  DivisionByZeroError,
  MathLib,
  type RoundingDirection,
} from "@morpho-org/morpho-ts";

import {
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
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
   * Computes buyer and seller prices for an offer and settlement fee.
   *
   * @param params - Price parameters.
   * @returns Buyer and seller prices.
   * @throws {NegativeValueError} when `settlementFee` or the offer tick is negative.
   * @throws {TickOutOfRangeError} when the offer tick exceeds `MAX_TICK`.
   * @throws {SettlementFeeExceedsPriceError} when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const offer = {
   *   buy: true,
   *   tick: 5_820n,
   * };
   *
   * const prices = TakeAmountsLib.prices({ offer, settlementFee: 1_000000000000n });
   * console.log(prices.buyerPrice);
   * ```
   */
  export function prices(params: {
    readonly offer: {
      readonly buy: boolean;
      readonly tick: BigIntish;
    };
    readonly settlementFee: BigIntish;
  }) {
    const settlementFee = BigInt(params.settlementFee);
    assertNonNegative("settlementFee", settlementFee);

    const offerPrice = TickLib.tickToPrice(params.offer.tick);
    if (params.offer.buy && offerPrice < settlementFee) {
      throw new SettlementFeeExceedsPriceError(settlementFee, offerPrice);
    }
    const sellerPrice = params.offer.buy
      ? offerPrice - settlementFee
      : offerPrice;
    const buyerPrice = sellerPrice + settlementFee;

    return { buyerPrice, sellerPrice } as const;
  }

  /**
   * Converts a target buyer-asset amount into units for an offer.
   *
   * `settlementFee` must be the fee for the offer market's current time to maturity.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target buyer assets where reachable.
   * @throws {NegativeValueError} when `targetBuyerAssets`, `settlementFee`, or the offer tick is negative.
   * @throws {DivisionByZeroError} when the computed buyer price is zero.
   * @throws {PriceGreaterThanOneError} when buyer price is above WAD.
   * @throws {TickOutOfRangeError} when the offer tick exceeds `MAX_TICK`.
   * @throws {SettlementFeeExceedsPriceError} when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const offer = {
   *   buy: true,
   *   tick: 5_820n,
   * };
   *
   * const units = TakeAmountsLib.buyerAssetsToUnits({
   *   offer,
   *   targetBuyerAssets: 100n,
   *   settlementFee: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function buyerAssetsToUnits(params: {
    readonly offer: {
      readonly buy: boolean;
      readonly tick: BigIntish;
    };
    readonly targetBuyerAssets: BigIntish;
    readonly settlementFee: BigIntish;
  }) {
    const settlementFee = BigInt(params.settlementFee);
    const targetBuyerAssets = BigInt(params.targetBuyerAssets);
    assertNonNegative("targetBuyerAssets", targetBuyerAssets);

    const { buyerPrice } = prices({ offer: params.offer, settlementFee });
    if (buyerPrice === 0n) throw new DivisionByZeroError("buyerPrice");
    if (buyerPrice > MathLib.WAD)
      throw new PriceGreaterThanOneError(buyerPrice);

    return MathLib.mulDiv(
      targetBuyerAssets,
      MathLib.WAD,
      buyerPrice,
      params.offer.buy ? "Up" : "Down",
    );
  }

  /**
   * Converts a target seller-asset amount into units for an offer.
   *
   * `settlementFee` must be the fee for the offer market's current time to maturity.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target seller assets where reachable.
   * @throws {NegativeValueError} when `targetSellerAssets`, `settlementFee`, or the offer tick is negative.
   * @throws {DivisionByZeroError} when the computed seller price is zero.
   * @throws {TickOutOfRangeError} when the offer tick exceeds `MAX_TICK`.
   * @throws {SettlementFeeExceedsPriceError} when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib } from "@morpho-org/midnight-sdk";
   *
   * const offer = {
   *   buy: false,
   *   tick: 5_820n,
   * };
   *
   * const units = TakeAmountsLib.sellerAssetsToUnits({
   *   offer,
   *   targetSellerAssets: 100n,
   *   settlementFee: 0n,
   * });
   * console.log(units);
   * ```
   */
  export function sellerAssetsToUnits(params: {
    readonly offer: {
      readonly buy: boolean;
      readonly tick: BigIntish;
    };
    readonly targetSellerAssets: BigIntish;
    readonly settlementFee: BigIntish;
  }) {
    const settlementFee = BigInt(params.settlementFee);
    const targetSellerAssets = BigInt(params.targetSellerAssets);
    assertNonNegative("targetSellerAssets", targetSellerAssets);

    const { sellerPrice } = prices({ offer: params.offer, settlementFee });
    if (sellerPrice === 0n) throw new DivisionByZeroError("sellerPrice");

    return MathLib.mulDiv(
      targetSellerAssets,
      MathLib.WAD,
      sellerPrice,
      params.offer.buy ? "Up" : "Down",
    );
  }

  /**
   * Converts assets to units at a WAD price.
   *
   * This is an SDK-only generic conversion convenience.
   *
   * @param params - Generic conversion parameters.
   * @returns Units.
   * @throws {NegativeValueError} when `assets` or `price` is negative.
   * @throws {DivisionByZeroError} when price is zero.
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

    return MathLib.mulDiv(assets, MathLib.WAD, price, params.rounding);
  }

  /**
   * Converts assets to units at a tick price.
   *
   * This is an SDK-only tick-priced conversion convenience.
   *
   * @param params - Tick conversion parameters.
   * @returns Units.
   * @throws {NegativeValueError} when `assets` or `tick` is negative.
   * @throws {DivisionByZeroError} when the tick price is zero.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
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

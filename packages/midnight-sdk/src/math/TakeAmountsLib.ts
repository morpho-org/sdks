import {
  assertNonNegative,
  DivisionByZeroError,
  MathLib,
  type RoundingDirection,
} from "@morpho-org/morpho-ts";

import {
  PriceGreaterThanOneError,
  SettlementFeeExceedsPriceError,
} from "../errors.js";
import { type IOffer, Offer } from "../offers/index.js";
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
   * Computes buyer and seller prices for an offer and settlement fee.
   *
   * @param params - Price parameters.
   * @returns Buyer and seller prices.
   * @throws NegativeValueError when `settlementFee` or the offer tick is negative.
   * @throws TickOutOfRangeError when the offer tick exceeds `MAX_TICK`.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib, type IOffer } from "@morpho-org/midnight-sdk";
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
   * const prices = TakeAmountsLib.prices({ offer, settlementFee: 1_000000000000n });
   * console.log(prices.buyerPrice);
   * ```
   */
  export function prices(params: {
    readonly offer: IOffer | Offer;
    readonly settlementFee: BigIntish;
  }) {
    const offer = Offer.from(params.offer);
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
   * `settlementFee` must be the fee for the offer market's current time to maturity.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target buyer assets where reachable.
   * @throws NegativeValueError when `targetBuyerAssets`, `settlementFee`, or the offer tick is negative.
   * @throws DivisionByZeroError when the computed buyer price is zero.
   * @throws PriceGreaterThanOneError when buyer price is above WAD.
   * @throws TickOutOfRangeError when the offer tick exceeds `MAX_TICK`.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib, type IOffer } from "@morpho-org/midnight-sdk";
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
   * const units = TakeAmountsLib.buyerAssetsToUnits({
   *   offer,
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
    const offer = Offer.from(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    const targetBuyerAssets = BigInt(params.targetBuyerAssets);
    assertNonNegative("targetBuyerAssets", targetBuyerAssets);

    const { buyerPrice } = prices({ offer, settlementFee });
    if (buyerPrice === 0n) throw new DivisionByZeroError("buyerPrice");
    if (buyerPrice > MathLib.WAD)
      throw new PriceGreaterThanOneError(buyerPrice);

    return MathLib.mulDiv(
      targetBuyerAssets,
      MathLib.WAD,
      buyerPrice,
      offer.buy ? "Up" : "Down",
    );
  }

  /**
   * Converts a target seller-asset amount into units for an offer.
   *
   * `settlementFee` must be the fee for the offer market's current time to maturity.
   *
   * @param params - Conversion parameters.
   * @returns Units that round-trip to the target seller assets where reachable.
   * @throws NegativeValueError when `targetSellerAssets`, `settlementFee`, or the offer tick is negative.
   * @throws DivisionByZeroError when the computed seller price is zero.
   * @throws TickOutOfRangeError when the offer tick exceeds `MAX_TICK`.
   * @throws SettlementFeeExceedsPriceError when settlement fee exceeds a buy offer price.
   * @example
   * ```ts
   * import { TakeAmountsLib, type IOffer } from "@morpho-org/midnight-sdk";
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
   *   buy: false,
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
   * const units = TakeAmountsLib.sellerAssetsToUnits({
   *   offer,
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
    const offer = Offer.from(params.offer);
    const settlementFee = BigInt(params.settlementFee);
    const targetSellerAssets = BigInt(params.targetSellerAssets);
    assertNonNegative("targetSellerAssets", targetSellerAssets);

    const { sellerPrice } = prices({ offer, settlementFee });
    if (sellerPrice === 0n) throw new DivisionByZeroError("sellerPrice");

    return MathLib.mulDiv(
      targetSellerAssets,
      MathLib.WAD,
      sellerPrice,
      offer.buy ? "Up" : "Down",
    );
  }

  /**
   * Converts assets to units at a WAD price.
   *
   * This is an SDK-only generic conversion convenience.
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

    return MathLib.mulDiv(assets, MathLib.WAD, price, params.rounding);
  }

  /**
   * Converts assets to units at a tick price.
   *
   * This is an SDK-only tick-priced conversion convenience.
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

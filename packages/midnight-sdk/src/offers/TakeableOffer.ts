import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Hex } from "viem";
import type { IOffer, Offer, OfferStruct } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";
import {
  type CreateManyTakeableOffersParams,
  TakeableOfferUtils,
} from "./TakeableOfferUtils.js";

/**
 * Plain take-side input accepted by {@link TakeableOffer}.
 *
 * Use this after a quote, book, or maker-offers API response has been mapped
 * back into SDK offer input and paired with the API-provided `units` and
 * `ratifierData`. The protocol group id belongs to the inline offer.
 *
 * @example
 * ```ts
 * import type { ITakeableOffer } from "@morpho-org/midnight-sdk";
 *
 * const takeableOffer = {} as ITakeableOffer;
 * console.log(takeableOffer.units);
 * ```
 */
export interface ITakeableOffer {
  /** Units to take from this offer. */
  readonly units: BigIntish;
  /** Inline offer. */
  readonly offer: IOffer;
  /** Ratifier data payload. */
  readonly ratifierData: Hex;
}

/**
 * Take-side executable offer normalized for Midnight take or bundle calldata.
 *
 * API responses expose signed maker offers plus the amount to take. Use
 * {@link TakeableOffer.createMany} to normalize those entries, assert the
 * expected maker side, and keep the offer's group id with ratifier data before
 * ABI encoding.
 *
 * @example
 * ```ts
 * import type { TakeableOffer } from "@morpho-org/midnight-sdk";
 *
 * const takeableOffer = {} as TakeableOffer;
 * console.log(takeableOffer.units);
 * ```
 */
export class TakeableOffer {
  /** Units to take from this offer. */
  public readonly units: bigint;
  /** Inline offer. */
  public readonly offer: Offer;
  /** Ratifier data payload. */
  public readonly ratifierData: Hex;

  public constructor(takeableOffer: ITakeableOffer) {
    this.units = BigInt(takeableOffer.units);
    this.offer = OfferUtils.normalizeOffer(takeableOffer.offer);
    this.ratifierData = takeableOffer.ratifierData;
  }

  /**
   * Converts API/app quote entries into takeable-offer class instances.
   *
   * Use after `MidnightApi.fetchBookQuote`, `fetchBookTakeableOffers`, or
   * `fetchTakeableOffers` has returned executable offers and after the API
   * offer shape has been mapped into `IOffer`. Convert the returned instances
   * with `TakeableOfferUtils.toStruct` before building take calldata.
   *
   * @param params - Quote conversion parameters.
   * @returns Takeable offers in caller order.
   * @throws {NoMatchingOffersError} when `entries` is empty.
   * @throws {UnexpectedOfferSideError} when an entry has the wrong side.
   * @throws {InconsistentMarketError} when market consistency is enforced and differs.
   * @example
   * ```ts
   * import { TakeableOffer } from "@morpho-org/midnight-sdk";
   *
   * const offers = TakeableOffer.createMany({ entries: [{} as never] });
   * console.log(offers.length);
   * ```
   */
  public static createMany(
    params: CreateManyTakeableOffersParams,
  ): readonly TakeableOffer[] {
    return TakeableOfferUtils.toStructs(params).map(
      (takeableOffer) =>
        new TakeableOffer({
          units: takeableOffer.units,
          offer: takeableOffer.offer,
          ratifierData: takeableOffer.ratifierData,
        }),
    );
  }
}

/**
 * ABI tuple shape for a takeable offer.
 *
 * This is the take-side shape to pass into Midnight take or bundle calldata
 * encoders after `TakeableOffer.createMany` or `TakeableOfferUtils.toStructs`
 * has validated side and market assumptions.
 *
 * @example
 * ```ts
 * import type { TakeableOfferStruct } from "@morpho-org/midnight-sdk";
 *
 * const takeableOffer = {} as TakeableOfferStruct;
 * console.log(takeableOffer.ratifierData);
 * ```
 */
export interface TakeableOfferStruct {
  /** Units to take from this offer. */
  readonly units: bigint;
  /** Inline offer. */
  readonly offer: OfferStruct;
  /** Ratifier data payload. */
  readonly ratifierData: Hex;
}

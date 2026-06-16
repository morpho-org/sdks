import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Hex } from "viem";
import type { IOffer, Offer, OfferStruct } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";
import {
  type CreateManyTakeableOffersParams,
  TakeableOfferUtils,
} from "./TakeableOfferUtils.js";

/**
 * Plain input accepted by {@link TakeableOffer}.
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
  readonly offer: IOffer | Offer;
  /** Ratifier data payload. */
  readonly ratifierData: Hex;
}

/**
 * Quote-facing executable offer normalized for Midnight bundle conversion.
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
   * @param params - Quote conversion parameters.
   * @returns Takeable offers in caller order.
   * @throws NoMatchingOffersError when `entries` is empty.
   * @throws UnexpectedOfferSideError when an entry has the wrong side.
   * @throws InconsistentMarketError when market consistency is enforced and differs.
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
      (takeableOffer) => new TakeableOffer(takeableOffer),
    );
  }
}

/**
 * ABI tuple shape for a takeable offer.
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

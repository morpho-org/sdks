import type { Hex } from "viem";
import type { BigIntish } from "../types.js";
import type { IOffer, Offer, OfferStruct } from "./Offer.js";

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
export interface TakeableOffer {
  /** Units to take from this offer. */
  readonly units: bigint;
  /** Inline offer. */
  readonly offer: Offer;
  /** Ratifier data payload. */
  readonly ratifierData: Hex;
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

import type { Hex } from "viem";

import { deepFreeze } from "../internal.js";
import type { BigIntish } from "../types.js";
import {
  type IOffer,
  normalizeOffer,
  type Offer,
  type OfferStruct,
} from "./Offer.js";

/**
 * Plain input accepted by {@link Take}.
 *
 * @example
 * ```ts
 * import type { ITake } from "@morpho-org/midnight-sdk";
 *
 * const take = {} as ITake;
 * console.log(take.units);
 * ```
 */
export interface ITake {
  /** Units to take from this offer. */
  readonly units: BigIntish;
  /** Inline offer. */
  readonly offer: IOffer | Offer;
  /** Ratifier data payload. */
  readonly ratifierData: Hex;
}

/**
 * ABI-compatible Midnight bundle take.
 *
 * @example
 * ```ts
 * import { Take } from "@morpho-org/midnight-sdk";
 *
 * const take = new Take({ units: 1n, offer: {} as never, ratifierData: "0x" });
 * console.log(take.units);
 * ```
 */
export class Take {
  /** Units to take from this offer. */
  public readonly units: bigint;

  /** Inline offer. */
  public readonly offer: Offer;

  /** Ratifier data payload. */
  public readonly ratifierData: Hex;

  public constructor(take: ITake) {
    this.units = BigInt(take.units);
    this.offer = normalizeOffer(take.offer);
    this.ratifierData = take.ratifierData as Hex;
    deepFreeze(this);
  }

  /**
   * Converts the class into the tuple object expected by viem ABI encoders.
   *
   * @returns ABI-compatible take.
   * @example
   * ```ts
   * import { Take } from "@morpho-org/midnight-sdk";
   *
   * const tuple = new Take({ units: 1n, offer: {} as never, ratifierData: "0x" }).toStruct();
   * console.log(tuple.units);
   * ```
   */
  public toStruct(): TakeStruct {
    return {
      units: this.units,
      offer: this.offer.toStruct(),
      ratifierData: this.ratifierData,
    };
  }
}

/**
 * ABI tuple shape for `Take`.
 *
 * @example
 * ```ts
 * import type { TakeStruct } from "@morpho-org/midnight-sdk";
 *
 * const take = {} as TakeStruct;
 * console.log(take.ratifierData);
 * ```
 */
export interface TakeStruct {
  /** Units to take from this offer. */
  readonly units: bigint;
  /** Inline offer. */
  readonly offer: OfferStruct;
  /** Ratifier data payload. */
  readonly ratifierData: Hex;
}

/**
 * Normalizes a take into an immutable class.
 *
 * @param take - Plain or class take.
 * @returns Normalized take.
 * @example
 * ```ts
 * import { normalizeTake } from "@morpho-org/midnight-sdk";
 *
 * const take = normalizeTake({ units: 1n, offer: {} as never, ratifierData: "0x" });
 * console.log(take.units);
 * ```
 */
export function normalizeTake(take: ITake | Take) {
  return take instanceof Take ? take : new Take(take);
}

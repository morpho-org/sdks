import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Hex } from "viem";
import {
  InconsistentMarketError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import type { BigIntish } from "../types.js";
import {
  type IOffer,
  normalizeOffer,
  type Offer,
  offerToStruct,
} from "./Offer.js";
import type { TakeableOfferStruct } from "./TakeableOffer.js";

/**
 * Quote entry shape converted by {@link TakeableOfferUtils.createMany}.
 *
 * @example
 * ```ts
 * import type { QuoteTakeableOfferInput } from "@morpho-org/midnight-sdk";
 *
 * const input = {} as QuoteTakeableOfferInput;
 * console.log(input.ratifierData);
 * ```
 */
export interface QuoteTakeableOfferInput {
  /** Units suggested by the quote/API. */
  readonly units: BigIntish;
  /** Ratifier data suggested by the quote/API. */
  readonly ratifierData: Hex;
  /** Inline executable offer. */
  readonly offer: IOffer | Offer;
}

/**
 * Parameters for {@link TakeableOfferUtils.createMany}.
 *
 * @example
 * ```ts
 * import type { CreateManyTakeableOffersParams } from "@morpho-org/midnight-sdk";
 *
 * const params: CreateManyTakeableOffersParams = { entries: [] };
 * console.log(params.entries.length);
 * ```
 */
export interface CreateManyTakeableOffersParams {
  /** Quote entries to convert. */
  readonly entries: readonly QuoteTakeableOfferInput[];
  /** Expected maker side. */
  readonly expectedOfferSide?: "buy" | "sell";
  /** Whether every offer must reference the same market. */
  readonly enforceSameMarket?: boolean;
}

/**
 * Object-compatible helpers for API/app takeable-offer conversion.
 *
 * @example
 * ```ts
 * import { TakeableOfferUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof TakeableOfferUtils.createMany);
 * ```
 */
export namespace TakeableOfferUtils {
  /**
   * Converts quote entries into ABI-compatible takeable offers.
   *
   * @param params - Quote conversion parameters.
   * @returns ABI-compatible takeable offers.
   * @throws NoMatchingOffersError when `entries` is empty.
   * @throws UnexpectedOfferSideError when an entry has the wrong side.
   * @throws InconsistentMarketError when market consistency is enforced and differs.
   * @example
   * ```ts
   * import { TakeableOfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const takeableOffers = TakeableOfferUtils.createMany({ entries: [] });
   * console.log(takeableOffers);
   * ```
   */
  export function createMany(
    params: CreateManyTakeableOffersParams,
  ): readonly TakeableOfferStruct[] {
    if (params.entries.length === 0) throw new NoMatchingOffersError();

    const takeableOffers = params.entries.map((entry) => {
      const offer = normalizeOffer(entry.offer);
      if (params.expectedOfferSide != null) {
        const actual = offer.buy ? "buy" : "sell";
        if (actual !== params.expectedOfferSide) {
          throw new UnexpectedOfferSideError(params.expectedOfferSide, actual);
        }
      }

      return {
        units: BigInt(entry.units),
        offer: offerToStruct(offer),
        ratifierData: entry.ratifierData,
      };
    });

    if (params.enforceSameMarket === true) {
      const [first, ...rest] = takeableOffers;
      const firstHash = MarketUtils.hashMarket(first!.offer.market);
      for (const takeableOffer of rest) {
        if (MarketUtils.hashMarket(takeableOffer.offer.market) !== firstHash) {
          throw new InconsistentMarketError();
        }
      }
    }

    return deepFreeze(takeableOffers);
  }
}

import { type Hex, zeroAddress } from "viem";

import {
  InconsistentMarketError,
  MissingOfferGroupError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import { deepFreeze, normalizeAddress } from "../internal.js";
import { MarketUtils } from "../market/index.js";
import type { BigIntish } from "../types.js";
import {
  type BuildOfferParams,
  type IOffer,
  normalizeOffer,
  Offer,
} from "./Offer.js";
import { Take, type TakeStruct } from "./Take.js";

/**
 * Quote entry shape converted by {@link OfferUtils.buildTakesFromOffers}.
 *
 * @example
 * ```ts
 * import type { QuoteTakeInput } from "@morpho-org/midnight-sdk";
 *
 * const input = {} as QuoteTakeInput;
 * console.log(input.ratifierData);
 * ```
 */
export interface QuoteTakeInput {
  /** Units suggested by the quote/router. */
  readonly units: BigIntish;
  /** Ratifier data suggested by the quote/router. */
  readonly ratifierData: Hex;
  /** Inline executable offer. */
  readonly offer: IOffer | Offer;
}

/**
 * Parameters for {@link OfferUtils.buildTakesFromOffers}.
 *
 * @example
 * ```ts
 * import type { BuildTakesFromOffersParams } from "@morpho-org/midnight-sdk";
 *
 * const params: BuildTakesFromOffersParams = { entries: [] };
 * console.log(params.entries.length);
 * ```
 */
export interface BuildTakesFromOffersParams {
  /** Quote entries to convert. */
  readonly entries: readonly QuoteTakeInput[];
  /** Expected maker side. */
  readonly expectedOfferSide?: "buy" | "sell";
  /** Whether every offer must reference the same market. */
  readonly enforceSameMarket?: boolean;
}

/**
 * Domain helpers for Midnight offers and takes.
 *
 * @example
 * ```ts
 * import { OfferUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof OfferUtils.getOfferExpiry);
 * ```
 */
export namespace OfferUtils {
  const resolveGroup = (params: BuildOfferParams) => {
    if (params.group != null) return params.group;
    if (params.getRandomValues != null) {
      return Offer.randomGroup(params.getRandomValues);
    }

    throw new MissingOfferGroupError();
  };

  /**
   * Builds a normalized offer from make-offer parameters.
   *
   * @param params - Offer parameters.
   * @returns Normalized offer.
   * @throws MissingOfferGroupError when neither `group` nor `getRandomValues` is supplied.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offer = OfferUtils.buildOffer({} as never);
   * console.log(offer instanceof Object);
   * ```
   */
  export function buildOffer(params: BuildOfferParams) {
    const maker = normalizeAddress(params.maker, "maker");

    return new Offer({
      market: params.market,
      buy: params.buy,
      maker,
      start: params.start ?? 0n,
      expiry: params.expiry,
      tick: params.tick,
      group: resolveGroup(params),
      callback: params.callback ?? zeroAddress,
      callbackData: params.callbackData ?? "0x",
      receiverIfMakerIsSeller: params.receiverIfMakerIsSeller ?? maker,
      ratifier: params.ratifier,
      reduceOnly: params.reduceOnly ?? false,
      maxUnits: params.maxUnits ?? 0n,
      maxAssets: params.maxAssets ?? 0n,
    });
  }

  /**
   * Converts quote entries into ABI-compatible `Take[]`.
   *
   * @param params - Quote conversion parameters.
   * @returns ABI-compatible takes.
   * @throws NoMatchingOffersError when `entries` is empty.
   * @throws UnexpectedOfferSideError when an entry has the wrong side.
   * @throws InconsistentMarketError when market consistency is enforced and differs.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const takes = OfferUtils.buildTakesFromOffers({ entries: [] });
   * console.log(takes);
   * ```
   */
  export function buildTakesFromOffers(
    params: BuildTakesFromOffersParams,
  ): readonly TakeStruct[] {
    if (params.entries.length === 0) throw new NoMatchingOffersError();

    const takes = params.entries.map((entry) => {
      const offer = normalizeOffer(entry.offer);
      if (params.expectedOfferSide != null) {
        const actual = offer.buy ? "buy" : "sell";
        if (actual !== params.expectedOfferSide) {
          throw new UnexpectedOfferSideError(params.expectedOfferSide, actual);
        }
      }

      return new Take({
        units: entry.units,
        offer,
        ratifierData: entry.ratifierData,
      }).toStruct();
    });

    if (params.enforceSameMarket === true) {
      const [first, ...rest] = takes;
      const firstHash = MarketUtils.hashMarket(first!.offer.market);
      for (const take of rest) {
        if (MarketUtils.hashMarket(take.offer.market) !== firstHash) {
          throw new InconsistentMarketError();
        }
      }
    }

    return deepFreeze(takes);
  }

  /**
   * Returns an offer expiry timestamp.
   *
   * @param offer - Offer to inspect.
   * @returns Offer expiry.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const expiry = OfferUtils.getOfferExpiry({ expiry: 1n } as never);
   * console.log(expiry);
   * ```
   */
  export function getOfferExpiry(offer: IOffer | Offer) {
    return normalizeOffer(offer).expiry;
  }
}

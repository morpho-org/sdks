import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  InconsistentMarketError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import { OfferUtils } from "./OfferUtils.js";
import type { ITakeableOffer, TakeableOfferStruct } from "./TakeableOffer.js";

/**
 * Parameters for {@link TakeableOffer.createMany}.
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
  readonly entries: readonly ITakeableOffer[];
  /** Expected maker side. */
  readonly expectedOfferSide?: "buy" | "sell";
  /** Whether every offer must reference the same market. */
  readonly enforceSameMarket?: boolean;
}

/**
 * Object-compatible helpers for API/app takeable-offer conversion.
 *
 * These are take-side utilities. Use them after API decoding and before
 * building take or bundle calldata. They do not fetch books or choose amounts;
 * they only normalize quoted entries, enforce optional side/market invariants,
 * and produce ABI-compatible structs.
 *
 * @example
 * ```ts
 * import { TakeableOfferUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof TakeableOfferUtils.toStructs);
 * ```
 */
export namespace TakeableOfferUtils {
  /**
   * Converts a takeable offer into the tuple object expected by viem ABI encoders.
   *
   * Use for a single normalized takeable offer immediately before passing it to
   * a take or bundle calldata encoder. Use `toStructs` when converting a whole
   * quote so side and market consistency can be checked together.
   *
   * @param takeableOffer - Takeable offer class or plain input.
   * @returns ABI-compatible takeable offer.
   * @example
   * ```ts
   * import { TakeableOfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const takeableOffer = TakeableOfferUtils.toStruct({} as never);
   * console.log(takeableOffer.units);
   * ```
   */
  export function toStruct(takeableOffer: ITakeableOffer): TakeableOfferStruct {
    return {
      units: BigInt(takeableOffer.units),
      offer: OfferUtils.toStruct({ offer: takeableOffer.offer }),
      ratifierData: takeableOffer.ratifierData,
    };
  }

  /**
   * Converts quote entries into ABI-compatible takeable offers.
   *
   * Use after API responses are mapped to `ITakeableOffer`. Set
   * `expectedOfferSide` from the requested book side (`asks` means maker
   * `sell`, `bids` means maker `buy`) and set `enforceSameMarket` before
   * aggregating entries into one market-order transaction.
   *
   * @param params - Quote conversion parameters.
   * @returns ABI-compatible takeable offers.
   * @throws {NoMatchingOffersError} when `entries` is empty.
   * @throws {UnexpectedOfferSideError} when an entry has the wrong side.
   * @throws {InconsistentMarketError} when market consistency is enforced and differs.
   * @example
   * ```ts
   * import { TakeableOfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const takeableOffers = TakeableOfferUtils.toStructs({ entries: [] });
   * console.log(takeableOffers);
   * ```
   */
  export function toStructs(
    params: CreateManyTakeableOffersParams,
  ): readonly TakeableOfferStruct[] {
    if (params.entries.length === 0) throw new NoMatchingOffersError();

    const takeableOffers = params.entries.map((entry) => {
      const offer = OfferUtils.normalizeOffer(entry.offer);
      if (params.expectedOfferSide != null) {
        const actual = offer.buy ? "buy" : "sell";
        if (actual !== params.expectedOfferSide) {
          throw new UnexpectedOfferSideError(params.expectedOfferSide, actual);
        }
      }

      return {
        units: BigInt(entry.units),
        offer: OfferUtils.toStruct({ offer }),
        ratifierData: entry.ratifierData,
      };
    });

    if (params.enforceSameMarket === true) {
      const [first, ...rest] = takeableOffers;
      const firstHash = MarketUtils.hash(first!.offer.market);
      for (const takeableOffer of rest) {
        if (MarketUtils.hash(takeableOffer.offer.market) !== firstHash) {
          throw new InconsistentMarketError();
        }
      }
    }

    return deepFreeze(takeableOffers);
  }
}

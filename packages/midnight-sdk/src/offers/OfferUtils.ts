import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, zeroAddress } from "viem";
import { DEFAULT_TICK_SPACING, MAX_TICK } from "../constants.js";
import {
  InconsistentMarketError,
  InvalidOfferGroupError,
  InvalidOfferParameterError,
  MissingOfferGroupError,
  NoMatchingOffersError,
  UnexpectedOfferSideError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import type { BigIntish } from "../types.js";
import { type BuildOfferParams, type IOffer, Offer } from "./Offer.js";
import type { TakeableOfferStruct } from "./TakeableOffer.js";

const comparableHex = (value: string) => value.toLowerCase();

const readBigIntParameter = (parameter: string, value: BigIntish) => {
  try {
    return BigInt(value);
  } catch (cause) {
    throw new InvalidOfferParameterError({
      parameter,
      value,
      instruction: "Use a bigint-compatible integer value.",
      cause,
    });
  }
};

/**
 * Quote entry shape converted by {@link OfferUtils.buildTakeableOffersFromOffers}.
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
  /** Units suggested by the quote/router. */
  readonly units: BigIntish;
  /** Ratifier data suggested by the quote/router. */
  readonly ratifierData: Hex;
  /** Inline executable offer. */
  readonly offer: IOffer | Offer;
}

/**
 * Parameters for {@link OfferUtils.buildTakeableOffersFromOffers}.
 *
 * @example
 * ```ts
 * import type { BuildTakeableOffersFromOffersParams } from "@morpho-org/midnight-sdk";
 *
 * const params: BuildTakeableOffersFromOffersParams = { entries: [] };
 * console.log(params.entries.length);
 * ```
 */
export interface BuildTakeableOffersFromOffersParams {
  /** Quote entries to convert. */
  readonly entries: readonly QuoteTakeableOfferInput[];
  /** Expected maker side. */
  readonly expectedOfferSide?: "buy" | "sell";
  /** Whether every offer must reference the same market. */
  readonly enforceSameMarket?: boolean;
}

/**
 * Parameters for {@link OfferUtils.buildOfferGroup}.
 *
 * @example
 * ```ts
 * import type { BuildOfferGroupParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as BuildOfferGroupParams;
 * console.log(params.offers.length);
 * ```
 */
export interface BuildOfferGroupParams {
  /** Offer builder parameters without per-offer group resolution. */
  readonly offers: readonly Omit<
    BuildOfferParams,
    "group" | "getRandomValues"
  >[];
  /** Shared consumption group for every offer. */
  readonly group?: Hex;
  /** Random source used once to generate a shared group when {@link group} is omitted. */
  readonly getRandomValues?: (array: Uint8Array) => Uint8Array;
}

/**
 * Parameters for {@link OfferUtils.validateOfferGroup}.
 *
 * @example
 * ```ts
 * import type { ValidateOfferGroupParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as ValidateOfferGroupParams;
 * console.log(params.offers.length);
 * ```
 */
export interface ValidateOfferGroupParams {
  /** Offers to validate as one protocol consumption group. */
  readonly offers: readonly (IOffer | Offer)[];
}

/**
 * Deterministic make-offer parameters after protocol validation.
 *
 * @example
 * ```ts
 * import type { ValidatedOfferParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as ValidatedOfferParams;
 * console.log(params.tick);
 * ```
 */
export interface ValidatedOfferParams {
  /** Tick in the deployed range and aligned to `tickSpacing`. */
  readonly tick: bigint;
  /** Market tick spacing used to validate tick accessibility. */
  readonly tickSpacing: bigint;
  /** Offer start timestamp. */
  readonly start: bigint;
  /** Offer expiry timestamp. */
  readonly expiry: bigint;
  /** Maximum units, with exactly one cap non-zero. */
  readonly maxUnits: bigint;
  /** Maximum buyer or seller assets, with exactly one cap non-zero. */
  readonly maxAssets: bigint;
  /** Receiver used only when maker is seller. */
  readonly receiverIfMakerIsSeller: Address;
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
  /**
   * Validates and normalizes a Midnight offer tick and spacing.
   *
   * @param params - Tick and optional market spacing.
   * @returns Normalized tick and tick spacing.
   * @throws InvalidOfferParameterError when the tick or spacing cannot be accepted by Midnight.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const { tick } = OfferUtils.validateOfferTick({ tick: 4n });
   * console.log(tick);
   * ```
   */
  export function validateOfferTick(params: {
    readonly tick: BigIntish;
    readonly tickSpacing?: BigIntish;
  }) {
    const tick = readBigIntParameter("tick", params.tick);
    const tickSpacing = readBigIntParameter(
      "tickSpacing",
      params.tickSpacing ?? DEFAULT_TICK_SPACING,
    );

    if (tick < 0n || tick > MAX_TICK) {
      throw new InvalidOfferParameterError({
        parameter: "tick",
        value: tick,
        instruction: `Use a tick between "0" and "${MAX_TICK}".`,
      });
    }
    if (tickSpacing <= 0n || DEFAULT_TICK_SPACING % tickSpacing !== 0n) {
      throw new InvalidOfferParameterError({
        parameter: "tickSpacing",
        value: tickSpacing,
        instruction: `Use a positive tick spacing that divides "${DEFAULT_TICK_SPACING}".`,
      });
    }
    if (tick % tickSpacing !== 0n) {
      throw new InvalidOfferParameterError({
        parameter: "tick",
        value: tick,
        instruction: `Use a tick aligned to spacing "${tickSpacing}".`,
      });
    }

    return { tick, tickSpacing };
  }

  /**
   * Validates and normalizes an offer start/expiry range.
   *
   * @param params - Start and expiry timestamps.
   * @returns Normalized start and expiry timestamps.
   * @throws InvalidOfferParameterError when the range is negative or inverted.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const range = OfferUtils.validateOfferTimeRange({ start: 0n, expiry: 1n });
   * console.log(range.expiry);
   * ```
   */
  export function validateOfferTimeRange(params: {
    readonly start?: BigIntish;
    readonly expiry: BigIntish;
  }) {
    const start = readBigIntParameter("start", params.start ?? 0n);
    const expiry = readBigIntParameter("expiry", params.expiry);

    if (start < 0n) {
      throw new InvalidOfferParameterError({
        parameter: "start",
        value: start,
        instruction: "Use a non-negative timestamp.",
      });
    }
    if (expiry < 0n || expiry < start) {
      throw new InvalidOfferParameterError({
        parameter: "expiry",
        value: expiry,
        instruction: `Use an expiry greater than or equal to start "${start}".`,
      });
    }

    return { start, expiry };
  }

  /**
   * Validates and normalizes mutually exclusive offer caps.
   *
   * @param params - Unit and asset caps.
   * @returns Normalized unit and asset caps.
   * @throws InvalidOfferParameterError when caps are negative, both zero, or both non-zero.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const caps = OfferUtils.validateOfferCaps({ maxAssets: 100n });
   * console.log(caps.maxAssets);
   * ```
   */
  export function validateOfferCaps(params: {
    readonly maxUnits?: BigIntish;
    readonly maxAssets?: BigIntish;
  }) {
    const maxUnits = readBigIntParameter("maxUnits", params.maxUnits ?? 0n);
    const maxAssets = readBigIntParameter("maxAssets", params.maxAssets ?? 0n);

    if (maxUnits < 0n) {
      throw new InvalidOfferParameterError({
        parameter: "maxUnits",
        value: maxUnits,
        instruction: "Use a non-negative cap.",
      });
    }
    if (maxAssets < 0n) {
      throw new InvalidOfferParameterError({
        parameter: "maxAssets",
        value: maxAssets,
        instruction: "Use a non-negative cap.",
      });
    }
    if ((maxAssets === 0n) === (maxUnits === 0n)) {
      throw new InvalidOfferParameterError({
        parameter: "maxUnits/maxAssets",
        value: `maxUnits=${maxUnits}, maxAssets=${maxAssets}`,
        instruction: "Set exactly one offer cap to a non-zero value.",
      });
    }

    return { maxUnits, maxAssets };
  }

  /**
   * Resolves and validates the maker-seller receiver field for an offer side.
   *
   * @param params - Offer side, maker, and optional maker-seller receiver.
   * @returns Receiver address to put on the offer.
   * @throws InvalidOfferParameterError when a buy offer sets a non-zero maker-seller receiver.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const receiver = OfferUtils.resolveReceiverIfMakerIsSeller({
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000000001",
   * });
   * console.log(receiver);
   * ```
   */
  export function resolveReceiverIfMakerIsSeller(params: {
    readonly buy: boolean;
    readonly maker: Address | string;
    readonly receiverIfMakerIsSeller?: Address | string;
  }) {
    const maker = params.maker as Address;
    const receiverIfMakerIsSeller =
      params.receiverIfMakerIsSeller ?? (params.buy ? zeroAddress : maker);

    if (params.buy && receiverIfMakerIsSeller !== zeroAddress) {
      throw new InvalidOfferParameterError({
        parameter: "receiverIfMakerIsSeller",
        value: receiverIfMakerIsSeller,
        instruction: "Use the zero address for buy offers.",
      });
    }

    return receiverIfMakerIsSeller as Address;
  }

  /**
   * Validates deterministic make-offer parameters without constructing an offer.
   *
   * @param params - Offer builder parameters.
   * @returns Normalized deterministic offer parameters.
   * @throws InvalidOfferParameterError when a deterministic offer parameter cannot satisfy protocol rules.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const params = OfferUtils.validateOfferParams({} as never);
   * console.log(params.maxAssets);
   * ```
   */
  export function validateOfferParams(
    params: BuildOfferParams,
  ): ValidatedOfferParams {
    const { tick, tickSpacing } = validateOfferTick(params);
    const { start, expiry } = validateOfferTimeRange(params);
    const { maxUnits, maxAssets } = validateOfferCaps(params);
    const receiverIfMakerIsSeller = resolveReceiverIfMakerIsSeller(params);

    return {
      tick,
      tickSpacing,
      start,
      expiry,
      maxUnits,
      maxAssets,
      receiverIfMakerIsSeller,
    };
  }

  /**
   * Builds an offer from make-offer parameters.
   *
   * @param params - Offer parameters.
   * @returns Offer instance.
   * @throws MissingOfferGroupError when neither `group` nor `getRandomValues` is supplied.
   * @throws InvalidOfferParameterError when a deterministic offer parameter cannot satisfy protocol rules.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offer = OfferUtils.buildOffer({} as never);
   * console.log(offer instanceof Object);
   * ```
   */
  export function buildOffer(params: BuildOfferParams) {
    const maker = params.maker as Address;
    const validated = validateOfferParams(params);

    let group = params.group;
    if (group == null) {
      if (params.getRandomValues == null) throw new MissingOfferGroupError();
      group = Offer.randomGroup(params.getRandomValues);
    }

    return new Offer({
      market: params.market,
      buy: params.buy,
      maker,
      start: validated.start,
      expiry: validated.expiry,
      tick: validated.tick,
      group,
      callback: params.callback ?? zeroAddress,
      callbackData: params.callbackData ?? "0x",
      receiverIfMakerIsSeller: validated.receiverIfMakerIsSeller,
      ratifier: params.ratifier,
      reduceOnly: params.reduceOnly ?? false,
      maxUnits: validated.maxUnits,
      maxAssets: validated.maxAssets,
    });
  }

  /**
   * Builds a protocol-valid group of offers with one shared consumption group id.
   *
   * @param params - Offer group builder parameters.
   * @returns Immutable offers in the same order as the input entries.
   * @throws MissingOfferGroupError when non-empty input has neither `group` nor `getRandomValues`.
   * @throws InvalidOfferGroupError when the built offers violate group mechanics.
   * @throws InvalidOfferParameterError when an individual offer parameter cannot satisfy protocol rules.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offers = OfferUtils.buildOfferGroup({
   *   offers: [{} as never],
   *   group: "0x0000000000000000000000000000000000000000000000000000000000000000",
   * });
   * console.log(offers.length);
   * ```
   */
  export function buildOfferGroup(
    params: BuildOfferGroupParams,
  ): readonly Offer[] {
    if (params.offers.length === 0) {
      return validateOfferGroup({ offers: [] });
    }

    let group = params.group;
    if (group == null) {
      if (params.getRandomValues == null) throw new MissingOfferGroupError();
      group = Offer.randomGroup(params.getRandomValues);
    }

    return validateOfferGroup({
      offers: params.offers.map((offer) => buildOffer({ ...offer, group })),
    });
  }

  /**
   * Validates protocol-level mechanics for one Midnight offer consumption group.
   *
   * This intentionally checks only shared group mechanics. It does not apply
   * router policy such as ratifier allowlists, callbacks, validation windows,
   * content-addressed groups, or full-payload inclusion rules.
   *
   * @param params - Offer group validation parameters.
   * @returns Immutable offers in the same order as the input entries.
   * @throws InvalidOfferGroupError when the group violates protocol mechanics.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offers = OfferUtils.validateOfferGroup({ offers: [{} as never] });
   * console.log(offers.length);
   * ```
   */
  export function validateOfferGroup(
    params: ValidateOfferGroupParams,
  ): readonly Offer[] {
    if (params.offers.length === 0) {
      throw new InvalidOfferGroupError(
        "Provide at least one offer in the group.",
      );
    }

    const offers = params.offers.map((offer) => Offer.from(offer));
    const first = offers[0]!;

    if (
      first.maxUnits < 0n ||
      first.maxAssets < 0n ||
      (first.maxAssets === 0n) === (first.maxUnits === 0n)
    ) {
      throw new InvalidOfferGroupError(
        "Every offer must set exactly one non-zero non-negative cap.",
      );
    }

    const expectedMaker = comparableHex(first.maker);
    const expectedGroup = comparableHex(first.group);
    const expectedBuy = first.buy;
    const expectedMaxUnits = first.maxUnits;
    const expectedMaxAssets = first.maxAssets;
    const expectedLoanToken = comparableHex(first.market.loanToken);

    for (const offer of offers) {
      if (comparableHex(offer.maker) !== expectedMaker) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same maker.",
        );
      }
      if (comparableHex(offer.group) !== expectedGroup) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same group id.",
        );
      }
      if (offer.buy !== expectedBuy) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same maker side.",
        );
      }
      if (
        offer.maxUnits < 0n ||
        offer.maxAssets < 0n ||
        (offer.maxAssets === 0n) === (offer.maxUnits === 0n)
      ) {
        throw new InvalidOfferGroupError(
          "Every offer must set exactly one non-zero non-negative cap.",
        );
      }
      if (
        offer.maxUnits !== expectedMaxUnits ||
        offer.maxAssets !== expectedMaxAssets
      ) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same unit and asset caps.",
        );
      }
      if (comparableHex(offer.market.loanToken) !== expectedLoanToken) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same loan token.",
        );
      }
    }

    return [...offers];
  }

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
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const takeableOffers = OfferUtils.buildTakeableOffersFromOffers({ entries: [] });
   * console.log(takeableOffers);
   * ```
   */
  export function buildTakeableOffersFromOffers(
    params: BuildTakeableOffersFromOffersParams,
  ): readonly TakeableOfferStruct[] {
    if (params.entries.length === 0) throw new NoMatchingOffersError();

    const takeableOffers = params.entries.map((entry) => {
      const offer = Offer.from(entry.offer);
      if (params.expectedOfferSide != null) {
        const actual = offer.buy ? "buy" : "sell";
        if (actual !== params.expectedOfferSide) {
          throw new UnexpectedOfferSideError(params.expectedOfferSide, actual);
        }
      }

      return {
        units: BigInt(entry.units),
        offer: offer.toStruct(),
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
    return Offer.from(offer).expiry;
  }
}

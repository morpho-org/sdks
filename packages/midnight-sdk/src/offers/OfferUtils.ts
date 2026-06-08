import {
  type Address,
  encodeAbiParameters,
  type Hex,
  keccak256,
  zeroAddress,
  zeroHash,
} from "viem";
import { DEFAULT_TICK_SPACING, MAX_TICK } from "../constants.js";
import {
  InvalidOfferGroupError,
  InvalidOfferParameterError,
} from "../errors.js";
import type { BigIntish } from "../types.js";
import {
  type BuildOfferParams,
  type IOffer,
  normalizeOffer,
  Offer,
  offerStructAbiComponents,
  offerToStruct,
} from "./Offer.js";

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
 * Parameters for {@link Offer.createGroup}.
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
  readonly offers: readonly Omit<BuildOfferParams, "group">[];
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
   * Creates an offer from validated make-offer parameters.
   *
   * This is the object-compatible implementation behind {@link Offer.create}.
   *
   * @param params - Offer parameters.
   * @returns Offer instance.
   * @throws InvalidOfferParameterError when a deterministic offer parameter cannot satisfy protocol rules.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offer = OfferUtils.createOffer({} as never);
   * console.log(offer instanceof Object);
   * ```
   */
  export function createOffer(params: BuildOfferParams) {
    const maker = params.maker as Address;
    const validated = validateOfferParams(params);

    return new Offer({
      market: params.market,
      buy: params.buy,
      maker,
      start: validated.start,
      expiry: validated.expiry,
      tick: validated.tick,
      group: params.group,
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
   * Derives the deterministic group id for a group of offers.
   *
   * The group field itself is zeroed before hashing so the resulting group id
   * is content-addressed by the offer contents it commits to.
   *
   * @param offers - Offers to hash.
   * @returns Content-addressed group id.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const group = OfferUtils.deriveOfferGroup([{} as never]);
   * console.log(group);
   * ```
   */
  export function deriveOfferGroup(offers: readonly (IOffer | Offer)[]): Hex {
    const structs = offers.map((offer) => ({
      ...offerToStruct(offer),
      group: zeroHash,
    }));

    return keccak256(
      encodeAbiParameters(
        [
          {
            name: "offers",
            type: "tuple[]",
            components: offerStructAbiComponents,
          },
        ],
        [structs],
      ),
    );
  }

  /**
   * Creates a protocol-valid group of offers with one content-addressed group id.
   *
   * @param params - Offer group builder parameters.
   * @returns Immutable offers in the same order as the input entries.
   * @throws InvalidOfferGroupError when the built offers violate group mechanics.
   * @throws InvalidOfferParameterError when an individual offer parameter cannot satisfy protocol rules.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offers = OfferUtils.createOfferGroup({ offers: [{} as never] });
   * console.log(offers.length);
   * ```
   */
  export function createOfferGroup(
    params: BuildOfferGroupParams,
  ): readonly Offer[] {
    if (params.offers.length === 0) {
      return validateOfferGroup({ offers: [] });
    }

    const ungroupedOffers = params.offers.map((offer) =>
      createOffer({ ...offer, group: zeroHash }),
    );
    const group = deriveOfferGroup(ungroupedOffers);

    return validateOfferGroup({
      offers: params.offers.map((offer) => createOffer({ ...offer, group })),
    });
  }

  /**
   * Validates protocol-level mechanics for one Midnight offer consumption group.
   *
   * This intentionally checks only protocol mechanics. API-publication policy
   * such as content-addressed groups lives in
   * {@link validateOfferGroupForApiPublication}.
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

    const offers = params.offers.map((offer) => normalizeOffer(offer));
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
      if (comparableHex(offer.market.loanToken) !== expectedLoanToken) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same loan token.",
        );
      }
      if (
        offer.buy &&
        comparableHex(offer.receiverIfMakerIsSeller) !==
          comparableHex(zeroAddress)
      ) {
        throw new InvalidOfferGroupError(
          "Buy offers must use the zero address as receiverIfMakerIsSeller.",
        );
      }
    }

    return [...offers];
  }

  /**
   * Validates the public API publication rules known locally.
   *
   * This helper intentionally stays narrow: changing public policy should be
   * surfaced by `MidnightApi.validateMempoolTree` when possible. The stable
   * local checks are protocol group validity and content-addressed group ids.
   *
   * @param params - Offer group validation parameters.
   * @returns Immutable offers in the same order as the input entries.
   * @throws InvalidOfferGroupError when the group cannot be published through the public API.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offers = OfferUtils.validateOfferGroupForApiPublication({
   *   offers: [{} as never],
   * });
   * console.log(offers.length);
   * ```
   */
  export function validateOfferGroupForApiPublication(
    params: ValidateOfferGroupParams,
  ): readonly Offer[] {
    const offers = validateOfferGroup(params);
    const expectedGroup = comparableHex(deriveOfferGroup(offers));
    const expectedCallback = comparableHex(offers[0]!.callback);
    const expectedCallbackData = comparableHex(offers[0]!.callbackData);

    for (const offer of offers) {
      if (comparableHex(offer.group) !== expectedGroup) {
        throw new InvalidOfferGroupError(
          "All offers in an API-published group must use the content-addressed group id.",
        );
      }
      if (
        comparableHex(offer.callback) !== expectedCallback ||
        comparableHex(offer.callbackData) !== expectedCallbackData
      ) {
        throw new InvalidOfferGroupError(
          "All offers in an API-published group must use the same callback address and data.",
        );
      }
    }

    return offers;
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

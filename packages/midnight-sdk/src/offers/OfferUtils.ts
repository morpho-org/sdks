import {
  assertNonNegative,
  type BigIntish,
  DivisionByZeroError,
  MathLib,
} from "@morpho-org/morpho-ts";
import type { Address, Hash } from "viem";
import { encodeAbiParameters, keccak256, zeroAddress, zeroHash } from "viem";
import {
  DEFAULT_TICK_SPACING,
  MAX_CONTINUOUS_FEE,
  MAX_TICK,
  OFFER_TYPEHASH,
} from "../constants.js";
import {
  InvalidOfferGroupError,
  InvalidOfferParameterError,
} from "../errors.js";
import { Market, MarketParams, MarketUtils } from "../market/index.js";
import { TakeAmountsLib, TickLib } from "../math/index.js";
import {
  type BuildOfferParams,
  type IOffer,
  Offer,
  type OfferStruct,
} from "./Offer.js";

const comparableHex = (value: string) => value.toLowerCase();

const offerHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "marketHash", type: "bytes32" },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackDataHash", type: "bytes32" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint256" },
  { name: "maxAssets", type: "uint256" },
  { name: "continuousFeeCap", type: "uint256" },
] as const;

/**
 * Parameters for {@link OfferUtils.validateOfferGroup}.
 *
 * Use this lower-level shape when validating a would-be `Group` before the
 * offers are committed to a tree.
 *
 * @example
 * ```ts
 * import type { ValidateOfferGroupParams } from "@morpho-org/midnight-sdk";
 *
 * const params = { offers: [] } as ValidateOfferGroupParams;
 * console.log(Array.from(params.offers).length);
 * ```
 */
export interface ValidateOfferGroupParams {
  /** Offers to validate as one protocol consumption group. */
  readonly offers: Iterable<IOffer>;
}

/**
 * Parameters for {@link OfferUtils.toStruct}.
 *
 * The group id is read from the offer by default. Supply `group` only when a
 * caller intentionally needs to encode the same offer with an override, such as
 * deriving a group id from an offer hashed with the zero group id.
 *
 * @example
 * ```ts
 * import { Offer, type OfferStructParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const params: OfferStructParams = {
 *   offer: Offer.create({
 *     market: {
 *       chainId: 8453,
 *       midnight: "0x0000000000000000000000000000000000001000",
 *       loanToken: "0x0000000000000000000000000000000000006000",
 *       collateralParams: [
 *         {
 *           token: "0x0000000000000000000000000000000000007000",
 *           lltv: 770000000000000000n,
 *           liquidationCursor: 250000000000000000n,
 *           oracle: "0x0000000000000000000000000000000000008000",
 *         },
 *       ],
 *       maturity: 54_000n,
 *       rcfThreshold: 0n,
 *       enterGate: zeroAddress,
 *       liquidatorGate: zeroAddress,
 *     },
 *     buy: true,
 *     maker: "0x0000000000000000000000000000000000009000",
 *     tick: 5_000n,
 *     expiry: 3_600n,
 *     ratifier: "0x0000000000000000000000000000000000004000",
 *     maxUnits: 100n,
 *   }),
 * };
 * console.log(params.offer);
 * ```
 */
export interface OfferStructParams {
  /** Offer to encode. */
  readonly offer: IOffer;
  /** Optional protocol group id override encoded into the ABI offer. */
  readonly group?: Hash;
}

/**
 * Parameters for {@link OfferUtils.getConsumableUnits}.
 *
 * @example
 * ```ts
 * import type { OfferConsumableUnitsParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {
 *   offer: {} as OfferConsumableUnitsParams["offer"],
 *   consumed: 0n,
 *   timestamp: 1_000n,
 * } satisfies OfferConsumableUnitsParams;
 * console.log(params.consumed);
 * ```
 */
export interface OfferConsumableUnitsParams {
  /** Offer to inspect. Its market must carry hydrated market state. */
  readonly offer: IOffer;
  /** Amount already consumed from the offer group. */
  readonly consumed: BigIntish;
  /** Timestamp used to compute time to maturity for settlement fee selection. */
  readonly timestamp: BigIntish;
}

/**
 * Deterministic make-offer parameters after protocol validation.
 *
 * @example
 * ```ts
 * import type { ValidatedOfferParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const params: ValidatedOfferParams = {
 *   tick: 5_000n,
 *   tickSpacing: 4n,
 *   start: 0n,
 *   expiry: 3_600n,
 *   maxUnits: 100n,
 *   maxAssets: 0n,
 *   receiverIfMakerIsSeller: zeroAddress,
 * };
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
  /** Maximum market continuous fee accepted by this offer. */
  readonly continuousFeeCap: bigint;
  /** Receiver used only when maker is seller. */
  readonly receiverIfMakerIsSeller: Address;
}

/**
 * Object-compatible helpers for Midnight offer construction, grouping, and
 * take-side encoding.
 *
 * Make-side apps usually call {@link Offer.create}, then `Group.create` or
 * `Tree.create`. Use these helpers when you need the same validation or ABI
 * conversion without depending on class instances, or when converting API data
 * into the structs consumed by payload and take encoders.
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
   * Converts an offer into the tuple object expected by viem ABI encoders.
   *
   * This is the bridge from SDK/domain objects
   * into Merkle leaf hashing, payload items, and take calldata encoding.
   *
   * @param params.offer - Offer class or plain offer input to encode.
   * @param params.group - Optional protocol group id override encoded into the ABI offer.
   * @returns ABI-compatible offer.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const struct = OfferUtils.toStruct({ offer });
   * console.log(struct.tick);
   * ```
   */
  export function toStruct(params: OfferStructParams): OfferStruct {
    const offer = Offer.from(params.offer);

    return {
      market: MarketUtils.toStruct(offer.market),
      buy: offer.buy,
      maker: offer.maker,
      start: offer.start,
      expiry: offer.expiry,
      tick: offer.tick,
      group: params.group ?? offer.group,
      callback: offer.callback,
      callbackData: offer.callbackData,
      receiverIfMakerIsSeller: offer.receiverIfMakerIsSeller,
      ratifier: offer.ratifier,
      reduceOnly: offer.reduceOnly,
      maxUnits: offer.maxUnits,
      maxAssets: offer.maxAssets,
      continuousFeeCap: offer.continuousFeeCap,
    };
  }

  /**
   * Computes the canonical protocol offer hash for an ABI-compatible offer.
   *
   * Use when you already have an `OfferStruct`, for example from
   * `GroupUtils.toStructs`, `TreeUtils.buildDescriptor`, or decoded payload
   * bytes. Use `hash` when you still have a grouped `Offer` or grouped plain
   * offer input, and `groupHash` when deriving a group id from the zero-group
   * hash.
   *
   * @param offerStruct - ABI-compatible offer to hash.
   * @returns Offer hash.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const hash = OfferUtils.hashStruct(
   *   OfferUtils.toStruct({ offer, group: zeroHash }),
   * );
   * console.log(hash);
   * ```
   */
  export function hashStruct(offerStruct: OfferStruct): Hash {
    return keccak256(
      encodeAbiParameters(offerHashParams, [
        OFFER_TYPEHASH,
        MarketUtils.hash(offerStruct.market),
        offerStruct.buy,
        offerStruct.maker,
        offerStruct.start,
        offerStruct.expiry,
        offerStruct.tick,
        offerStruct.group,
        offerStruct.callback,
        keccak256(offerStruct.callbackData),
        offerStruct.receiverIfMakerIsSeller,
        offerStruct.ratifier,
        offerStruct.reduceOnly,
        offerStruct.maxUnits,
        offerStruct.maxAssets,
        offerStruct.continuousFeeCap,
      ]),
    );
  }

  /**
   * Computes the canonical protocol offer hash from the offer's group id.
   *
   * Use this for final tree leaves and payload offers after a group has been
   * assigned. Use `groupHash` for the zero-group hash that derives a group id.
   *
   * @param offer - Offer with the protocol group id encoded into the hash.
   * @returns Offer hash.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   group: zeroHash,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const hash = OfferUtils.hash(offer);
   * console.log(hash);
   * ```
   */
  export function hash(offer: IOffer & { readonly group: Hash }): Hash {
    return hashStruct(toStruct({ offer }));
  }

  /**
   * Computes the offer hash used to derive a content-addressed group id.
   *
   * The encoded group is always the protocol zero hash. Use this only for
   * standalone or grouped-offer id derivation, not for final tree leaves or
   * payload offers.
   *
   * @param offer - Offer to hash without a group id.
   * @returns Offer hash encoded with the protocol zero group id.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const hash = OfferUtils.groupHash(offer);
   * console.log(hash);
   * ```
   */
  export function groupHash(offer: Omit<IOffer, "group">): Hash {
    return hashStruct(toStruct({ offer, group: zeroHash }));
  }

  /**
   * Validates and normalizes a Midnight offer tick and spacing.
   *
   * Use this for form-level validation before `Offer.create` when you want to
   * surface a tick-specific issue. `Offer.create` calls it internally.
   *
   * @param params.tick - Offer tick to validate.
   * @param params.tickSpacing - Optional market tick spacing; defaults to `DEFAULT_TICK_SPACING`.
   * @returns Normalized tick and tick spacing.
   * @throws {InvalidOfferParameterError} when the tick or spacing cannot be accepted by Midnight.
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
    const tick = BigInt(params.tick);
    const tickSpacing = BigInt(params.tickSpacing ?? DEFAULT_TICK_SPACING);

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
   * Use this before `Offer.create` when a UI edits dates separately from other
   * offer fields. `Offer.create` calls it internally.
   *
   * @param params.start - Optional offer start timestamp; defaults to zero.
   * @param params.expiry - Offer expiry timestamp.
   * @returns Normalized start and expiry timestamps.
   * @throws {InvalidOfferParameterError} when the range is negative or expiry is before start.
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
    const start = BigInt(params.start ?? 0n);
    const expiry = BigInt(params.expiry);

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
   * Use this before `Offer.create` when a UI lets makers choose between a unit
   * cap and an asset cap. `Offer.create` calls it internally.
   *
   * @param params.maxUnits - Optional unit cap; defaults to zero.
   * @param params.maxAssets - Optional buyer or seller asset cap; defaults to zero.
   * @returns Normalized unit and asset caps.
   * @throws {InvalidOfferParameterError} when caps are negative, both zero, or both non-zero.
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
    const maxUnits = BigInt(params.maxUnits ?? 0n);
    const maxAssets = BigInt(params.maxAssets ?? 0n);

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
   * Validates and normalizes the maximum continuous fee an offer accepts.
   *
   * Use this before `Offer.create` when a maker UI exposes fee tolerance.
   * `Offer.create` calls it internally and defaults omitted values to
   * {@link MAX_CONTINUOUS_FEE}.
   *
   * @param params.continuousFeeCap - Optional maximum market continuous fee accepted by this offer.
   * @returns Normalized continuous fee cap.
   * @throws {InvalidOfferParameterError} when the cap is negative.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const cap = OfferUtils.validateContinuousFeeCap({});
   * console.log(cap.continuousFeeCap);
   * ```
   */
  export function validateContinuousFeeCap(params: {
    readonly continuousFeeCap?: BigIntish;
  }) {
    const continuousFeeCap = BigInt(
      params.continuousFeeCap ?? MAX_CONTINUOUS_FEE,
    );

    if (continuousFeeCap < 0n) {
      throw new InvalidOfferParameterError({
        parameter: "continuousFeeCap",
        value: continuousFeeCap,
        instruction: "Use a non-negative continuous fee cap.",
      });
    }

    return { continuousFeeCap };
  }

  /**
   * Resolves and validates the maker-seller receiver field for an offer side.
   *
   * Use this before `Offer.create` when side-specific receiver defaults must be
   * displayed to a maker. `Offer.create` calls it internally.
   *
   * @param params.buy - Whether the maker buys loan assets.
   * @param params.maker - Maker address used as the default sell-side receiver.
   * @param params.receiverIfMakerIsSeller - Optional receiver used when maker is seller.
   * @returns Receiver address to put on the offer.
   * @throws {InvalidOfferParameterError} when a buy offer sets a non-zero maker-seller receiver.
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
    readonly maker: Address;
    readonly receiverIfMakerIsSeller?: Address;
  }) {
    const maker = params.maker;
    const receiverIfMakerIsSeller =
      params.receiverIfMakerIsSeller ?? (params.buy ? zeroAddress : maker);

    if (params.buy && receiverIfMakerIsSeller !== zeroAddress) {
      throw new InvalidOfferParameterError({
        parameter: "receiverIfMakerIsSeller",
        value: receiverIfMakerIsSeller,
        instruction: "Use the zero address for buy offers.",
      });
    }

    return receiverIfMakerIsSeller;
  }

  /**
   * Validates deterministic make-offer parameters without constructing an offer.
   *
   * Use when an app needs normalized maker input or field-level errors before
   * instantiating an `Offer`. `Offer.create` uses the same validation and then
   * constructs the class instance for grouping and trees.
   *
   * @param params.market - Market params or hydrated market this offer trades.
   * @param params.buy - Whether the maker buys loan assets.
   * @param params.maker - Maker address.
   * @param params.tick - Offer tick.
   * @param params.group - Optional consumption group id for already-grouped offers.
   * @param params.tickSpacing - Optional market tick spacing; defaults to `DEFAULT_TICK_SPACING`.
   * @param params.maxUnits - Optional unit cap; defaults to zero.
   * @param params.maxAssets - Optional buyer or seller asset cap; defaults to zero.
   * @param params.continuousFeeCap - Optional maximum market continuous fee accepted by this offer; defaults to `MAX_CONTINUOUS_FEE`.
   * @param params.start - Optional offer start timestamp; defaults to zero.
   * @param params.expiry - Offer expiry timestamp.
   * @param params.callback - Optional callback address; defaults to the zero address.
   * @param params.callbackData - Optional callback payload; defaults to `0x`.
   * @param params.receiverIfMakerIsSeller - Optional receiver used when maker is seller.
   * @param params.ratifier - Ratifier contract address.
   * @param params.reduceOnly - Optional flag restricting the offer to exposure-reducing execution.
   * @returns Normalized deterministic offer parameters.
   * @throws {InvalidOfferParameterError} when a deterministic offer parameter cannot satisfy protocol rules.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const params = OfferUtils.validateOfferParams({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * console.log(params.maxAssets);
   * ```
   */
  export function validateOfferParams(
    params: BuildOfferParams,
  ): ValidatedOfferParams {
    const { tick, tickSpacing } = validateOfferTick(params);
    const { start, expiry } = validateOfferTimeRange(params);
    const { maxUnits, maxAssets } = validateOfferCaps(params);
    const { continuousFeeCap } = validateContinuousFeeCap(params);
    const receiverIfMakerIsSeller = resolveReceiverIfMakerIsSeller(params);

    return {
      tick,
      tickSpacing,
      start,
      expiry,
      maxUnits,
      maxAssets,
      continuousFeeCap,
      receiverIfMakerIsSeller,
    };
  }

  /**
   * Validates protocol-level mechanics for one Midnight offer consumption group.
   *
   * Use before deriving a content-addressed group id. Grouped offers must share
   * maker, side, loan token, cap mode, and cap value because Midnight tracks one
   * consumed scalar per maker and group. `Group.create` calls this automatically;
   * call it directly only when you need the normalized offers without
   * constructing a `Group`.
   *
   * @param params.offers - Offers to validate as one protocol consumption group.
   * @returns Normalized offers in the same order as the input entries.
   * @throws {InvalidOfferGroupError} when the group violates protocol mechanics.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const offers = OfferUtils.validateOfferGroup({ offers: [offer] });
   * console.log(offers.length);
   * ```
   */
  export function validateOfferGroup(
    params: ValidateOfferGroupParams,
  ): readonly Offer[] {
    const offerInputs = Array.from(params.offers);
    if (offerInputs.length === 0) {
      throw new InvalidOfferGroupError(
        "Provide at least one offer in the group.",
      );
    }

    const offers = offerInputs.map((offer) => Offer.from(offer));
    const first = offers[0]!;

    const expectedMaker = comparableHex(first.maker);
    const expectedBuy = first.buy;
    const expectedLoanToken = comparableHex(
      MarketParams.from(first.market).loanToken,
    );
    const expectedMaxUnits = first.maxUnits;
    const expectedMaxAssets = first.maxAssets;

    for (const offer of offers) {
      if (comparableHex(offer.maker) !== expectedMaker) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same maker.",
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
        comparableHex(MarketParams.from(offer.market).loanToken) !==
        expectedLoanToken
      ) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same loan token.",
        );
      }
      if (
        offer.maxUnits !== expectedMaxUnits ||
        offer.maxAssets !== expectedMaxAssets
      ) {
        throw new InvalidOfferGroupError(
          "All offers in a group must use the same cap mode and value.",
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
   * Converts an offer tick into its WAD zero-coupon price.
   *
   * Use for display or local quote checks when accepting any plain object
   * matching `IOffer` or an `Offer` instance.
   *
   * @param offer - Offer to inspect.
   * @returns WAD price rounded to the protocol price quantum.
   * @throws {NegativeValueError} when `offer.tick` is negative.
   * @throws {TickOutOfRangeError} when `offer.tick` exceeds `MAX_TICK`.
   * @example
   * ```ts
   * import { OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const price = OfferUtils.getPrice({ tick: 5_000n });
   * console.log(price);
   * ```
   */
  export function getPrice(offer: Pick<IOffer, "tick">) {
    return TickLib.tickToPrice(offer.tick);
  }

  /**
   * Converts an offer tick into a WAD per-second simple rate at a timestamp.
   *
   * The rate is the offer's fixed period rate divided by the market's remaining
   * time to maturity at `timestamp`, rounded up.
   *
   * @param params.offer - Offer to inspect.
   * @param params.timestamp - Timestamp at which the rate is calculated.
   * @returns WAD per-second simple rate rounded up.
   * @throws {NegativeValueError} when `market.maturity`, `timestamp`, or `tick` is negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @throws {DivisionByZeroError} when the tick price is zero or `timestamp` is at or after maturity.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.from({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   start: 0n,
   *   expiry: 3_600n,
   *   tick: 5_000n,
   *   callback: "0x0000000000000000000000000000000000000000",
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   reduceOnly: false,
   *   maxUnits: 100n,
   *   maxAssets: 0n,
   *   continuousFeeCap: 317097919n,
   * });
   * const rate = OfferUtils.getRate({ offer, timestamp: 1_000n });
   * console.log(rate);
   * ```
   */
  export function getRate(params: {
    readonly offer: Pick<IOffer, "market" | "tick">;
    readonly timestamp: BigIntish;
  }) {
    const market = MarketParams.from(params.offer.market);
    const timestamp = BigInt(params.timestamp);
    assertNonNegative("market.maturity", market.maturity);
    assertNonNegative("timestamp", timestamp);

    const timeToMaturity = MathLib.zeroFloorSub(market.maturity, timestamp);
    if (timeToMaturity === 0n) {
      throw new DivisionByZeroError("timeToMaturity");
    }

    return MathLib.mulDiv(
      TickLib.tickToRate(params.offer.tick),
      1n,
      timeToMaturity,
      "Up",
    );
  }

  /**
   * Converts an offer tick into a WAD simple annual percentage rate at a timestamp.
   *
   * It computes time to maturity from the offer market and delegates the final
   * tick annualization to `TickLib.tickToApr`.
   *
   * @param params.offer - Offer to inspect.
   * @param params.timestamp - Timestamp at which the APR is calculated.
   * @returns WAD simple APR rounded up.
   * @throws {NegativeValueError} when `market.maturity`, `timestamp`, or `tick` is negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @throws {DivisionByZeroError} when the tick price is zero or `timestamp` is at or after maturity.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.from({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         maxLif: 1061007957559681697n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   start: 0n,
   *   expiry: 3_600n,
   *   tick: 5_000n,
   *   callback: "0x0000000000000000000000000000000000000000",
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   reduceOnly: false,
   *   maxUnits: 100n,
   *   maxAssets: 0n,
   *   continuousFeeCap: 317097919n,
   * });
   * const apr = OfferUtils.getApr({ offer, timestamp: 1_000n });
   * console.log(apr);
   * ```
   */
  export function getApr(params: {
    readonly offer: Pick<IOffer, "market" | "tick">;
    readonly timestamp: BigIntish;
  }) {
    const market = MarketParams.from(params.offer.market);
    const timestamp = BigInt(params.timestamp);
    assertNonNegative("market.maturity", market.maturity);
    assertNonNegative("timestamp", timestamp);

    return TickLib.tickToApr(
      params.offer.tick,
      MathLib.zeroFloorSub(market.maturity, timestamp),
    );
  }

  /**
   * Returns remaining units accepted by an offer's cap at a timestamp.
   *
   * The offer must carry a hydrated {@link Market} so the current market
   * continuous fee and settlement-fee buckets are available locally. Fetch the
   * current `consumed(maker, group)` value separately and pass it as input.
   *
   * @param params.offer - Offer to inspect. Its market must be hydrated.
   * @param params.consumed - Amount already consumed from the offer group.
   * @param params.timestamp - Timestamp used to compute market time to maturity.
   * @returns Remaining consumable units accepted by Midnight `take`.
   * @throws {InvalidOfferParameterError} when the offer does not carry hydrated market state or has invalid caps.
   * @throws {NegativeValueError} when `consumed`, `timestamp`, offer limits, or delegated math inputs are negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @throws {SettlementFeeExceedsPriceError} when settlement fee exceeds a buy-offer price.
   * @example
   * ```ts
   * import { OfferUtils, midnightAbi } from "@morpho-org/midnight-sdk";
   * import { createPublicClient, http } from "viem";
   * import { base } from "viem/chains";
   * import { readContract } from "viem/actions";
   *
   * const client = createPublicClient({ chain: base, transport: http() });
   * const offer = {
   *   market: {
   *     params: {
   *       chainId: 8453,
   *       midnight: "0x0000000000000000000000000000000000001000",
   *       loanToken: "0x0000000000000000000000000000000000006000",
   *       collateralParams: [
   *         {
   *           token: "0x0000000000000000000000000000000000007000",
   *           lltv: 770000000000000000n,
   *           liquidationCursor: 250000000000000000n,
   *           oracle: "0x0000000000000000000000000000000000008000",
   *         },
   *       ],
   *       maturity: 54_000n,
   *       rcfThreshold: 0n,
   *       enterGate: "0x0000000000000000000000000000000000000000",
   *       liquidatorGate: "0x0000000000000000000000000000000000000000",
   *     },
   *     totalUnits: 1_000n,
   *     lossFactor: 0n,
   *     withdrawable: 500n,
   *     continuousFeeCredit: 0n,
   *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *     continuousFee: 10,
   *     tickSpacing: 4,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   start: 0n,
   *   expiry: 3_600n,
   *   tick: 5_000n,
   *   callback: "0x0000000000000000000000000000000000000000",
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   reduceOnly: false,
   *   maxUnits: 100n,
   *   maxAssets: 0n,
   *   continuousFeeCap: 317097919n,
   * } as const;
   * const consumed = await readContract(client, {
   *   address: "0x0000000000000000000000000000000000001000",
   *   abi: midnightAbi,
   *   functionName: "consumed",
   *   args: [offer.maker, "0x1111111111111111111111111111111111111111111111111111111111111111"],
   * });
   * const units = OfferUtils.getConsumableUnits({ offer, consumed, timestamp: 1_000n });
   * console.log(units);
   * ```
   */
  export function getConsumableUnits(
    params: OfferConsumableUnitsParams,
  ): bigint {
    const offer = Offer.from(params.offer);
    const consumed = BigInt(params.consumed);
    const maxUnits = BigInt(offer.maxUnits);
    const maxAssets = BigInt(offer.maxAssets);
    const continuousFeeCap = BigInt(offer.continuousFeeCap);
    assertNonNegative("consumed", consumed);
    assertNonNegative("offer.maxUnits", maxUnits);
    assertNonNegative("offer.maxAssets", maxAssets);
    assertNonNegative("offer.continuousFeeCap", continuousFeeCap);
    validateOfferCaps({ maxUnits, maxAssets });

    if (!("params" in offer.market)) {
      throw new InvalidOfferParameterError({
        parameter: "market",
        value: offer.market,
        instruction:
          "Provide a hydrated Market with continuous fee and settlement fee buckets.",
      });
    }

    const market =
      offer.market instanceof Market ? offer.market : new Market(offer.market);
    if (continuousFeeCap < BigInt(market.continuousFee)) return 0n;
    if (maxUnits > 0n) return MathLib.zeroFloorSub(maxUnits, consumed);

    const remainingAssets = MathLib.zeroFloorSub(maxAssets, consumed);
    const settlementFee = market.getSettlementFee(
      market.timeToMaturity(params.timestamp),
    );
    if (!offer.buy) {
      const { sellerPrice } = TakeAmountsLib.prices({
        offer,
        settlementFee,
      });
      if (sellerPrice === 0n) return MathLib.MAX_UINT_256;

      return MathLib.mulDivDown(remainingAssets, MathLib.WAD, sellerPrice);
    }

    const { buyerPrice } = TakeAmountsLib.prices({
      offer,
      settlementFee,
    });
    if (buyerPrice === 0n) return MathLib.MAX_UINT_256;

    return ((remainingAssets + 1n) * MathLib.WAD - 1n) / buyerPrice;
  }

  /**
   * Returns an offer expiry timestamp.
   *
   * Use in maker UIs, API response mappers, or quote filters when accepting
   * any plain object matching `IOffer` or an `Offer` instance. This does not validate
   * whether the offer is still live at the current block time.
   *
   * @param offer - Offer to inspect.
   * @returns Offer expiry.
   * @example
   * ```ts
   * import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [
   *       {
   *         token: "0x0000000000000000000000000000000000007000",
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle: "0x0000000000000000000000000000000000008000",
   *       },
   *     ],
   *     maturity: 54_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000009000",
   *   tick: 5_000n,
   *   expiry: 3_600n,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * const expiry = OfferUtils.getOfferExpiry(offer);
   * console.log(expiry);
   * ```
   */
  export function getOfferExpiry(offer: IOffer) {
    return BigInt(offer.expiry);
  }
}

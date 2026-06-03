import type { Address, Hex } from "viem";

import {
  deepFreeze,
  normalizeAddress,
  normalizeBytes32,
  normalizeHex,
  toBigInt,
} from "../internal.js";
import {
  type IMarket,
  type Market,
  type MarketStruct,
  normalizeMarket,
} from "../market/index.js";
import type { BigIntish } from "../types.js";

/**
 * Plain input accepted by {@link Offer}.
 *
 * @example
 * ```ts
 * import type { IOffer } from "@morpho-org/midnight-sdk";
 *
 * const offer: IOffer = {
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [],
 *     maturity: 1n,
 *     rcfThreshold: 0n,
 *     enterGate: "0x0000000000000000000000000000000000000000",
 *     liquidatorGate: "0x0000000000000000000000000000000000000000",
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000000002",
 *   start: 0n,
 *   expiry: 2n,
 *   tick: 100n,
 *   group: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *   callback: "0x0000000000000000000000000000000000000000",
 *   callbackData: "0x",
 *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
 *   ratifier: "0x0000000000000000000000000000000000000003",
 *   reduceOnly: false,
 *   maxUnits: 0n,
 *   maxAssets: 100n,
 * };
 * ```
 */
export interface IOffer {
  /** Market this offer trades. */
  readonly market: IMarket | Market;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker. */
  readonly maker: Address | string;
  /** Start timestamp. */
  readonly start: BigIntish;
  /** Expiry timestamp. */
  readonly expiry: BigIntish;
  /** Midnight tick. */
  readonly tick: BigIntish;
  /** Consumption group. */
  readonly group: Hex;
  /** Optional maker callback. */
  readonly callback: Address | string;
  /** Callback payload. */
  readonly callbackData: Hex;
  /** Receiver used when the maker is the seller. */
  readonly receiverIfMakerIsSeller: Address | string;
  /** Ratifier contract. */
  readonly ratifier: Address | string;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly: boolean;
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: BigIntish;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: BigIntish;
}

/**
 * ABI-compatible Midnight offer.
 *
 * @example
 * ```ts
 * import { Offer } from "@morpho-org/midnight-sdk";
 *
 * const offer = new Offer({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [],
 *     maturity: 1n,
 *     rcfThreshold: 0n,
 *     enterGate: "0x0000000000000000000000000000000000000000",
 *     liquidatorGate: "0x0000000000000000000000000000000000000000",
 *   },
 *   buy: false,
 *   maker: "0x0000000000000000000000000000000000000002",
 *   start: 0n,
 *   expiry: 2n,
 *   tick: 100n,
 *   group: Offer.randomGroup(crypto.getRandomValues.bind(crypto)),
 *   callback: "0x0000000000000000000000000000000000000000",
 *   callbackData: "0x",
 *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000002",
 *   ratifier: "0x0000000000000000000000000000000000000003",
 *   reduceOnly: false,
 *   maxUnits: 100n,
 *   maxAssets: 0n,
 * });
 * console.log(offer.toStruct().buy);
 * ```
 */
export class Offer {
  /** Market this offer trades. */
  public readonly market: Market;

  /** Whether the maker buys units. */
  public readonly buy: boolean;

  /** Offer maker. */
  public readonly maker: Address;

  /** Start timestamp. */
  public readonly start: bigint;

  /** Expiry timestamp. */
  public readonly expiry: bigint;

  /** Midnight tick. */
  public readonly tick: bigint;

  /** Consumption group. */
  public readonly group: Hex;

  /** Optional maker callback. */
  public readonly callback: Address;

  /** Callback payload. */
  public readonly callbackData: Hex;

  /** Receiver used when maker is seller. */
  public readonly receiverIfMakerIsSeller: Address;

  /** Ratifier contract. */
  public readonly ratifier: Address;

  /** Whether the offer can only reduce maker exposure. */
  public readonly reduceOnly: boolean;

  /** Maximum units; zero means max assets controls consumption. */
  public readonly maxUnits: bigint;

  /** Maximum buyer or seller assets, depending on side. */
  public readonly maxAssets: bigint;

  public constructor(offer: IOffer) {
    this.market = normalizeMarket(offer.market);
    this.buy = offer.buy;
    this.maker = normalizeAddress(offer.maker, "maker");
    this.start = toBigInt(offer.start, "start");
    this.expiry = toBigInt(offer.expiry, "expiry");
    this.tick = toBigInt(offer.tick, "tick");
    this.group = normalizeBytes32(offer.group, "group");
    this.callback = normalizeAddress(offer.callback, "callback");
    this.callbackData = normalizeHex(offer.callbackData, "callbackData");
    this.receiverIfMakerIsSeller = normalizeAddress(
      offer.receiverIfMakerIsSeller,
      "receiverIfMakerIsSeller",
    );
    this.ratifier = normalizeAddress(offer.ratifier, "ratifier");
    this.reduceOnly = offer.reduceOnly;
    this.maxUnits = toBigInt(offer.maxUnits, "maxUnits");
    this.maxAssets = toBigInt(offer.maxAssets, "maxAssets");
    deepFreeze(this);
  }

  /**
   * Generates an offer group id from an injected random byte source.
   *
   * The random source is supplied by the caller so this class does not read
   * wallet, runtime, or host globals implicitly.
   *
   * @param getRandomValues - Callback that fills a 32-byte array with random values.
   * @returns Random 32-byte group id.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const group = Offer.randomGroup(crypto.getRandomValues.bind(crypto));
   * console.log(group.length);
   * ```
   */
  public static randomGroup(
    getRandomValues: (array: Uint8Array) => Uint8Array,
  ): Hex {
    const bytes = new Uint8Array(32);
    getRandomValues(bytes);

    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  /**
   * Converts the class into the tuple object expected by viem ABI encoders.
   *
   * @returns ABI-compatible offer.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const offer = new Offer({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000000001",
   *     collateralParams: [],
   *     maturity: 1n,
   *     rcfThreshold: 0n,
   *     enterGate: "0x0000000000000000000000000000000000000000",
   *     liquidatorGate: "0x0000000000000000000000000000000000000000",
   *   },
   *   buy: true,
   *   maker: "0x0000000000000000000000000000000000000002",
   *   start: 0n,
   *   expiry: 2n,
   *   tick: 100n,
   *   group: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   callback: "0x0000000000000000000000000000000000000000",
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
   *   ratifier: "0x0000000000000000000000000000000000000003",
   *   reduceOnly: false,
   *   maxUnits: 0n,
   *   maxAssets: 100n,
   * }).toStruct();
   * console.log(offer.market.loanToken);
   * ```
   */
  public toStruct(): OfferStruct {
    return {
      market: this.market.toStruct(),
      buy: this.buy,
      maker: this.maker,
      start: this.start,
      expiry: this.expiry,
      tick: this.tick,
      group: this.group,
      callback: this.callback,
      callbackData: this.callbackData,
      receiverIfMakerIsSeller: this.receiverIfMakerIsSeller,
      ratifier: this.ratifier,
      reduceOnly: this.reduceOnly,
      maxUnits: this.maxUnits,
      maxAssets: this.maxAssets,
    };
  }
}

/**
 * ABI tuple shape for `Offer`.
 *
 * @example
 * ```ts
 * import type { OfferStruct } from "@morpho-org/midnight-sdk";
 *
 * const offer = {} as OfferStruct;
 * console.log(offer.buy);
 * ```
 */
export interface OfferStruct {
  /** Market this offer trades. */
  readonly market: MarketStruct;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker. */
  readonly maker: Address;
  /** Start timestamp. */
  readonly start: bigint;
  /** Expiry timestamp. */
  readonly expiry: bigint;
  /** Midnight tick. */
  readonly tick: bigint;
  /** Consumption group. */
  readonly group: Hex;
  /** Optional maker callback. */
  readonly callback: Address;
  /** Callback payload. */
  readonly callbackData: Hex;
  /** Receiver used when maker is seller. */
  readonly receiverIfMakerIsSeller: Address;
  /** Ratifier contract. */
  readonly ratifier: Address;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly: boolean;
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: bigint;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: bigint;
}

/**
 * Parameters for {@link OfferUtils.buildOffer}.
 *
 * @example
 * ```ts
 * import type { BuildOfferParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as BuildOfferParams;
 * console.log(params.buy);
 * ```
 */
export interface BuildOfferParams {
  /** Market this offer trades. */
  readonly market: IMarket | Market;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Maker address. */
  readonly maker: Address | string;
  /** Tick. */
  readonly tick: BigIntish;
  /** Maximum units; defaults to zero. */
  readonly maxUnits?: BigIntish;
  /** Maximum buyer or seller assets; defaults to zero. */
  readonly maxAssets?: BigIntish;
  /** Offer start timestamp; defaults to zero. */
  readonly start?: BigIntish;
  /** Offer expiry timestamp. */
  readonly expiry: BigIntish;
  /** Consumption group. When omitted, {@link getRandomValues} is used to generate one. */
  readonly group?: Hex;
  /** Random source used to generate a group when {@link group} is omitted. */
  readonly getRandomValues?: (array: Uint8Array) => Uint8Array;
  /** Callback address; defaults to zero address. */
  readonly callback?: Address | string;
  /** Callback payload; defaults to `0x`. */
  readonly callbackData?: Hex;
  /** Receiver used when maker is seller; defaults to maker. */
  readonly receiverIfMakerIsSeller?: Address | string;
  /** Ratifier contract. */
  readonly ratifier: Address | string;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly?: boolean;
}

/**
 * Normalizes an offer into an immutable class.
 *
 * @param offer - Plain or class offer.
 * @returns Normalized offer.
 * @example
 * ```ts
 * import { normalizeOffer } from "@morpho-org/midnight-sdk";
 *
 * const offer = normalizeOffer({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [],
 *     maturity: 1n,
 *     rcfThreshold: 0n,
 *     enterGate: "0x0000000000000000000000000000000000000000",
 *     liquidatorGate: "0x0000000000000000000000000000000000000000",
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000000002",
 *   start: 0n,
 *   expiry: 2n,
 *   tick: 100n,
 *   group: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *   callback: "0x0000000000000000000000000000000000000000",
 *   callbackData: "0x",
 *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
 *   ratifier: "0x0000000000000000000000000000000000000003",
 *   reduceOnly: false,
 *   maxUnits: 0n,
 *   maxAssets: 100n,
 * });
 * console.log(offer.buy);
 * ```
 */
export function normalizeOffer(offer: IOffer | Offer) {
  return offer instanceof Offer ? offer : new Offer(offer);
}

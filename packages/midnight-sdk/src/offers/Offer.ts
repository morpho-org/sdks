import type { BigIntish } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import type {
  IMarketParams,
  Market,
  MarketParamsStruct,
} from "../market/index.js";
import {
  type MarketParams,
  marketParamsToStruct,
  normalizeMarketParams,
} from "../market/Market.js";
import { type BuildOfferGroupParams, OfferUtils } from "./OfferUtils.js";

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
  readonly market: IMarketParams | MarketParams | Market;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker. */
  readonly maker: `0x${string}` | string;
  /** Start timestamp. */
  readonly start: BigIntish;
  /** Expiry timestamp. */
  readonly expiry: BigIntish;
  /** Midnight tick. */
  readonly tick: BigIntish;
  /** Consumption group. */
  readonly group: `0x${string}`;
  /** Optional maker callback. */
  readonly callback: `0x${string}` | string;
  /** Callback payload. */
  readonly callbackData: `0x${string}`;
  /** Receiver used when the maker is the seller. */
  readonly receiverIfMakerIsSeller: `0x${string}` | string;
  /** Ratifier contract. */
  readonly ratifier: `0x${string}` | string;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly: boolean;
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: BigIntish;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: BigIntish;
}

/**
 * Midnight offer.
 *
 * @example
 * ```ts
 * import { Offer } from "@morpho-org/midnight-sdk";
 *
 * const offer = Offer.create({
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
 *   group: "0x0000000000000000000000000000000000000000000000000000000000000000",
 *   callback: "0x0000000000000000000000000000000000000000",
 *   callbackData: "0x",
 *   receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000002",
 *   ratifier: "0x0000000000000000000000000000000000000003",
 *   reduceOnly: false,
 *   maxUnits: 100n,
 *   maxAssets: 0n,
 * });
 * console.log(offer.buy);
 * ```
 */
export class Offer {
  /** Market this offer trades. */
  public readonly market: MarketParams;

  /** Whether the maker buys units. */
  public readonly buy: boolean;

  /** Offer maker. */
  public readonly maker: `0x${string}`;

  /** Start timestamp. */
  public readonly start: bigint;

  /** Expiry timestamp. */
  public readonly expiry: bigint;

  /** Midnight tick. */
  public readonly tick: bigint;

  /** Consumption group. */
  public readonly group: `0x${string}`;

  /** Optional maker callback. */
  public readonly callback: `0x${string}`;

  /** Callback payload. */
  public readonly callbackData: `0x${string}`;

  /** Receiver used when maker is seller. */
  public readonly receiverIfMakerIsSeller: `0x${string}`;

  /** Ratifier contract. */
  public readonly ratifier: `0x${string}`;

  /** Whether the offer can only reduce maker exposure. */
  public readonly reduceOnly: boolean;

  /** Maximum units; zero means max assets controls consumption. */
  public readonly maxUnits: bigint;

  /** Maximum buyer or seller assets, depending on side. */
  public readonly maxAssets: bigint;

  public constructor(offer: IOffer) {
    this.market = normalizeMarketParams(offer.market);
    this.buy = offer.buy;
    this.maker = offer.maker as `0x${string}`;
    this.start = BigInt(offer.start);
    this.expiry = BigInt(offer.expiry);
    this.tick = BigInt(offer.tick);
    this.group = offer.group as `0x${string}`;
    this.callback = offer.callback as `0x${string}`;
    this.callbackData = offer.callbackData as `0x${string}`;
    this.receiverIfMakerIsSeller =
      offer.receiverIfMakerIsSeller as `0x${string}`;
    this.ratifier = offer.ratifier as `0x${string}`;
    this.reduceOnly = offer.reduceOnly;
    this.maxUnits = BigInt(offer.maxUnits);
    this.maxAssets = BigInt(offer.maxAssets);
  }

  /**
   * Creates a raw Midnight offer with an explicit protocol group id.
   *
   * @param params - Offer creation parameters.
   * @returns Offer instance.
   * @throws InvalidOfferParameterError when the offer cannot satisfy protocol parameter rules.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.create({} as never);
   * console.log(offer.group);
   * ```
   */
  public static create(params: BuildOfferParams): Offer {
    const validated = OfferUtils.validateOfferParams(params);

    return new Offer({
      market: params.market,
      buy: params.buy,
      maker: params.maker,
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
   * Creates offers that share a deterministic content-addressed group id.
   *
   * @param params - Offer group creation parameters.
   * @returns Immutable offers in caller order.
   * @throws InvalidOfferGroupError when the group cannot satisfy protocol mechanics.
   * @throws InvalidOfferParameterError when an offer cannot satisfy parameter rules.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const offers = Offer.createGroup({ offers: [{} as never] });
   * console.log(offers[0]?.group);
   * ```
   */
  public static createGroup(params: BuildOfferGroupParams): readonly Offer[] {
    return OfferUtils.createOfferGroup(params);
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
  readonly market: MarketParamsStruct;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker. */
  readonly maker: `0x${string}`;
  /** Start timestamp. */
  readonly start: bigint;
  /** Expiry timestamp. */
  readonly expiry: bigint;
  /** Midnight tick. */
  readonly tick: bigint;
  /** Consumption group. */
  readonly group: `0x${string}`;
  /** Optional maker callback. */
  readonly callback: `0x${string}`;
  /** Callback payload. */
  readonly callbackData: `0x${string}`;
  /** Receiver used when maker is seller. */
  readonly receiverIfMakerIsSeller: `0x${string}`;
  /** Ratifier contract. */
  readonly ratifier: `0x${string}`;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly: boolean;
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: bigint;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: bigint;
}

/**
 * @internal ABI parameter components for the canonical Solidity `Offer` tuple.
 */
export const offerStructAbiComponents = [
  {
    name: "market",
    type: "tuple",
    components: [
      { name: "loanToken", type: "address" },
      {
        name: "collateralParams",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "lltv", type: "uint256" },
          { name: "maxLif", type: "uint256" },
          { name: "oracle", type: "address" },
        ],
      },
      { name: "maturity", type: "uint256" },
      { name: "rcfThreshold", type: "uint256" },
      { name: "enterGate", type: "address" },
      { name: "liquidatorGate", type: "address" },
    ],
  },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackData", type: "bytes" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint256" },
  { name: "maxAssets", type: "uint256" },
] as const;

/**
 * @internal Returns an offer instance from class or plain input.
 *
 * @param offer - Offer class or plain input.
 * @returns Offer instance.
 */
export function normalizeOffer(offer: IOffer | Offer) {
  return offer instanceof Offer ? offer : new Offer(offer);
}

/**
 * @internal Converts an offer into the tuple object expected by viem ABI encoders.
 *
 * @param offer - Offer class or plain input.
 * @returns ABI-compatible offer.
 */
export function offerToStruct(offer: IOffer | Offer): OfferStruct {
  const normalizedOffer = normalizeOffer(offer);

  return {
    market: marketParamsToStruct(normalizedOffer.market),
    buy: normalizedOffer.buy,
    maker: normalizedOffer.maker,
    start: normalizedOffer.start,
    expiry: normalizedOffer.expiry,
    tick: normalizedOffer.tick,
    group: normalizedOffer.group,
    callback: normalizedOffer.callback,
    callbackData: normalizedOffer.callbackData,
    receiverIfMakerIsSeller: normalizedOffer.receiverIfMakerIsSeller,
    ratifier: normalizedOffer.ratifier,
    reduceOnly: normalizedOffer.reduceOnly,
    maxUnits: normalizedOffer.maxUnits,
    maxAssets: normalizedOffer.maxAssets,
  };
}

/**
 * Parameters for {@link Offer.create}.
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
  readonly market: IMarketParams | MarketParams | Market;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Maker address. */
  readonly maker: `0x${string}` | string;
  /** Tick. */
  readonly tick: BigIntish;
  /** Market tick spacing; defaults to the protocol's default spacing. */
  readonly tickSpacing?: BigIntish;
  /** Maximum units; defaults to zero. Exactly one of `maxUnits` and `maxAssets` must be non-zero. */
  readonly maxUnits?: BigIntish;
  /** Maximum buyer or seller assets; defaults to zero. Exactly one of `maxUnits` and `maxAssets` must be non-zero. */
  readonly maxAssets?: BigIntish;
  /** Offer start timestamp; defaults to zero. */
  readonly start?: BigIntish;
  /** Offer expiry timestamp. */
  readonly expiry: BigIntish;
  /** Explicit protocol consumption group. */
  readonly group: `0x${string}`;
  /** Callback address; defaults to zero address. */
  readonly callback?: `0x${string}` | string;
  /** Callback payload; defaults to `0x`. */
  readonly callbackData?: `0x${string}`;
  /** Receiver used when maker is seller; defaults to zero for buy offers and maker for sell offers. */
  readonly receiverIfMakerIsSeller?: `0x${string}` | string;
  /** Ratifier contract. */
  readonly ratifier: `0x${string}` | string;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly?: boolean;
}

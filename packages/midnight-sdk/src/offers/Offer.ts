import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Address, Hash, Hex } from "viem";
import { zeroAddress } from "viem";
import type { IMarket, IMarketParams, MarketParams } from "../market/index.js";
import { MarketUtils } from "../market/MarketUtils.js";
import { OfferUtils } from "./OfferUtils.js";

/**
 * Plain make-side offer input accepted by {@link Offer}.
 *
 * Use this shape when app or API data is already protocol-shaped and needs to
 * flow into `OfferUtils.normalizeOffer`, `Group.create`, `Tree.create`, or
 * take-side conversion helpers. Use {@link Offer.create} instead for new maker
 * offers so deterministic fields are validated before grouping or signing.
 * The `group` field is optional. When omitted, {@link Offer.group} lazily
 * derives the standalone group id from this offer hashed with the protocol
 * zero group id. `Group.create` copies offers into a shared group and overrides
 * this field on the copies it owns.
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
  readonly market: IMarketParams | IMarket;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Offer maker. */
  readonly maker: Address;
  /** Start timestamp. */
  readonly start: BigIntish;
  /** Expiry timestamp. */
  readonly expiry: BigIntish;
  /** Midnight tick. */
  readonly tick: BigIntish;
  /** Consumption group id; defaults to the offer hash with the zero group id. */
  readonly group?: Hash;
  /** Optional maker callback. */
  readonly callback: Address;
  /** Callback payload. */
  readonly callbackData: Hex;
  /** Receiver used when the maker is the seller. */
  readonly receiverIfMakerIsSeller: Address;
  /** Ratifier contract. */
  readonly ratifier: Address;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly: boolean;
  /** Maximum units; zero means max assets controls consumption. */
  readonly maxUnits: BigIntish;
  /** Maximum buyer or seller assets, depending on side. */
  readonly maxAssets: BigIntish;
}

/**
 * Maker-side Midnight offer.
 *
 * Build new maker offers with {@link Offer.create}, then pass them to
 * `Group.create` for shared-consumption ladders or directly to `Tree.create`
 * for standalone offers. API/take-side code can normalize a plain `IOffer`
 * into this class before ABI encoding. The class resolves the onchain `group`
 * field lazily. Standalone offers derive their group id from the offer hash
 * with the zero group id; `Group.create` copies offers and overrides the group
 * on those copies when several offers share one consumption bucket.
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
  public readonly maker: Address;

  /** Start timestamp. */
  public readonly start: bigint;

  /** Expiry timestamp. */
  public readonly expiry: bigint;

  /** Midnight tick. */
  public readonly tick: bigint;

  private cachedGroup: Hash | undefined;

  private cachedHash: Hash | undefined;

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
    this.market = MarketUtils.normalizeMarketParams(offer.market);
    this.buy = offer.buy;
    this.maker = offer.maker;
    this.start = BigInt(offer.start);
    this.expiry = BigInt(offer.expiry);
    this.tick = BigInt(offer.tick);
    this.cachedGroup = offer.group;
    this.callback = offer.callback;
    this.callbackData = offer.callbackData;
    this.receiverIfMakerIsSeller = offer.receiverIfMakerIsSeller;
    this.ratifier = offer.ratifier;
    this.reduceOnly = offer.reduceOnly;
    this.maxUnits = BigInt(offer.maxUnits);
    this.maxAssets = BigInt(offer.maxAssets);
  }

  /**
   * Consumption group id encoded into this offer.
   *
   * When no group id was provided, the value is computed on first access by
   * hashing this offer with the protocol zero group id. The computed value is
   * cached because offer hashing is resource-intensive.
   *
   * @returns Consumption group id.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.create({} as never);
   * console.log(offer.group);
   * ```
   */
  public get group(): Hash {
    this.cachedGroup ??= OfferUtils.groupHash(this);
    return this.cachedGroup;
  }

  /**
   * Canonical protocol offer hash for this offer.
   *
   * The hash includes {@link Offer.group}. It is computed lazily and cached
   * because hashing includes market hashing and ABI encoding.
   *
   * @returns Offer hash.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.create({} as never);
   * console.log(offer.hash);
   * ```
   */
  public get hash(): Hash {
    this.cachedHash ??= OfferUtils.hash(this);
    return this.cachedHash;
  }

  /**
   * Creates a validated maker-side Midnight offer without assigning a protocol
   * group.
   *
   * This is the first step of the make-side flow. After creation, pass related
   * offers to `Group.create` when they share consumption, or pass standalone
   * offers directly to `Tree.create`.
   *
   * @param params - Offer creation parameters.
   * @returns Offer instance.
   * @throws {InvalidOfferParameterError} when the offer cannot satisfy protocol parameter rules.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   *
   * const offer = Offer.create({} as never);
   * console.log(offer.tick);
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
}

/**
 * ABI tuple shape for `Offer`.
 *
 * This is the shape consumed by viem encoders, Merkle leaf hashing, payload
 * encoding, and take calldata encoders. Build it with `OfferUtils.toStruct` or
 * `GroupUtils.toStructs`; the group id is read from the offer unless an
 * explicit override is supplied.
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
  readonly market: MarketParams;
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
  readonly group: Hash;
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
 * Parameters for {@link Offer.create}.
 *
 * These are make-side parameters entered by a maker or order-management app
 * before any group, tree, ratifier data, or mempool payload exists.
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
  readonly market: IMarketParams | IMarket;
  /** Whether the maker buys units. */
  readonly buy: boolean;
  /** Maker address. */
  readonly maker: Address;
  /** Tick. */
  readonly tick: BigIntish;
  /** Consumption group id; defaults to the offer hash with the zero group id. */
  readonly group?: Hash;
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
  /** Callback address; defaults to zero address. */
  readonly callback?: Address;
  /** Callback payload; defaults to `0x`. */
  readonly callbackData?: Hex;
  /** Receiver used when maker is seller; defaults to zero for buy offers and maker for sell offers. */
  readonly receiverIfMakerIsSeller?: Address;
  /** Ratifier contract. */
  readonly ratifier: Address;
  /** Whether the offer can only reduce maker exposure. */
  readonly reduceOnly?: boolean;
}

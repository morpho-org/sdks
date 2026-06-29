import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Address, Hash, Hex } from "viem";
import { zeroAddress } from "viem";
import {
  type IMarket,
  type IMarketParams,
  MarketParams,
} from "../market/index.js";
import { OfferUtils } from "./OfferUtils.js";

/**
 * Plain make-side offer input accepted by {@link Offer}.
 *
 * Use this shape when app or API data is already protocol-shaped and needs to
 * flow into `Offer.from`, `Group.create`, `Tree.create`, or
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
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
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
 *   continuousFeeCap: 317097919n,
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
  /** Maximum market continuous fee accepted by this offer. */
  readonly continuousFeeCap: BigIntish;
}

/**
 * Maker-side Midnight offer.
 *
 * Build new maker offers with {@link Offer.create}, then pass them to
 * `Group.create` for shared-consumption ladders or directly to `Tree.create`
 * for standalone offers. API/take-side code can convert a plain `IOffer`
 * into this class before ABI encoding. The class resolves the onchain `group`
 * field lazily. Standalone offers derive their group id from the offer hash
 * with the zero group id; `Group.create` copies offers and overrides the group
 * on those copies when several offers share one consumption bucket. Offers
 * hydrated from API or decoded data may also carry a known group id.
 *
 * @example
 * ```ts
 * import { Offer } from "@morpho-org/midnight-sdk";
 *
 * const offer = Offer.create({
 *   market: {
 *     chainId: 8453,
 *     midnight: "0x0000000000000000000000000000000000001000",
 *     loanToken: "0x0000000000000000000000000000000000000001",
 *     collateralParams: [
 *       {
 *         token: "0x0000000000000000000000000000000000007000",
 *         lltv: 770000000000000000n,
 *         liquidationCursor: 250000000000000000n,
 *         oracle: "0x0000000000000000000000000000000000008000",
 *       },
 *     ],
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
 *   continuousFeeCap: 317097919n,
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

  /** Maximum market continuous fee accepted by this offer. */
  public readonly continuousFeeCap: bigint;

  public constructor(offer: IOffer) {
    this.market = MarketParams.from(offer.market);
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
    this.continuousFeeCap = BigInt(offer.continuousFeeCap);
  }

  /**
   * Returns an offer instance from class or plain input.
   *
   * Use at boundaries that accept either maker-created `Offer` instances or
   * decoded `IOffer` objects from an API response. For brand-new maker input,
   * prefer {@link Offer.create} so deterministic parameters are validated first.
   *
   * @param offer - Offer class or plain input.
   * @returns Offer instance.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.from({
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
   *   start: 0n,
   *   expiry: 3_600n,
   *   tick: 5_000n,
   *   callback: zeroAddress,
   *   callbackData: "0x",
   *   receiverIfMakerIsSeller: zeroAddress,
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   reduceOnly: false,
   *   maxUnits: 100n,
   *   maxAssets: 0n,
   *   continuousFeeCap: 317097919n,
   * });
   * console.log(offer.buy);
   * ```
   */
  public static from(offer: IOffer): Offer {
    return offer instanceof Offer ? offer : new Offer(offer);
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
   * import { zeroAddress } from "viem";
   *
   * const loanToken = "0x0000000000000000000000000000000000006000";
   * const collateralToken = "0x0000000000000000000000000000000000007000";
   * const oracle = "0x0000000000000000000000000000000000008000";
   * const maker = "0x0000000000000000000000000000000000009000";
   * const ratifier = "0x0000000000000000000000000000000000004000";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken,
   *     collateralParams: [
   *       {
   *         token: collateralToken,
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle,
   *       },
   *     ],
   *     maturity: 2_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker,
   *   tick: 5_000n,
   *   expiry: 2_100n,
   *   ratifier,
   *   maxAssets: 100n,
   * });
   *
   * const group = offer.group;
   * // group satisfies Hash
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
   * import { zeroAddress } from "viem";
   *
   * const loanToken = "0x0000000000000000000000000000000000006000";
   * const collateralToken = "0x0000000000000000000000000000000000007000";
   * const oracle = "0x0000000000000000000000000000000000008000";
   * const maker = "0x0000000000000000000000000000000000009000";
   * const ratifier = "0x0000000000000000000000000000000000004000";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken,
   *     collateralParams: [
   *       {
   *         token: collateralToken,
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle,
   *       },
   *     ],
   *     maturity: 2_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker,
   *   tick: 5_000n,
   *   expiry: 2_100n,
   *   ratifier,
   *   maxAssets: 100n,
   * });
   *
   * const hash = offer.hash;
   * // hash satisfies Hash
   * ```
   */
  public get hash(): Hash {
    this.cachedHash ??= OfferUtils.hash(this);
    return this.cachedHash;
  }

  /**
   * Creates a validated maker-side Midnight offer.
   *
   * This is the first step of the make-side flow. After creation, pass related
   * offers to `Group.create` when they share consumption, or pass standalone
   * offers directly to `Tree.create`. Omit `group` for brand-new maker offers;
   * provide it when hydrating an offer that already has a protocol group, such
   * as an offer decoded from the API.
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
   * @returns Offer instance.
   * @throws {InvalidOfferParameterError} when the offer cannot satisfy protocol parameter rules.
   * @example
   * ```ts
   * import { Offer } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const loanToken = "0x0000000000000000000000000000000000006000";
   * const collateralToken = "0x0000000000000000000000000000000000007000";
   * const oracle = "0x0000000000000000000000000000000000008000";
   * const maker = "0x0000000000000000000000000000000000009000";
   * const ratifier = "0x0000000000000000000000000000000000004000";
   * const apiGroup =
   *   "0x1111111111111111111111111111111111111111111111111111111111111111";
   *
   * const offer = Offer.create({
   *   market: {
   *     chainId: 8453,
   *     midnight: "0x0000000000000000000000000000000000001000",
   *     loanToken,
   *     collateralParams: [
   *       {
   *         token: collateralToken,
   *         lltv: 770000000000000000n,
   *         liquidationCursor: 250000000000000000n,
   *         oracle,
   *       },
   *     ],
   *     maturity: 2_000n,
   *     rcfThreshold: 0n,
   *     enterGate: zeroAddress,
   *     liquidatorGate: zeroAddress,
   *   },
   *   buy: true,
   *   maker,
   *   tick: 5_000n,
   *   group: apiGroup,
   *   expiry: 2_100n,
   *   ratifier,
   *   maxAssets: 100n,
   * });
   * // offer satisfies Offer
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
      continuousFeeCap: validated.continuousFeeCap,
    });
  }
}

/**
 * ABI tuple shape for `Offer`.
 *
 * This is the shape consumed by viem encoders, Merkle leaf hashing, payload
 * encoding, and take calldata encoders. Build it with `OfferUtils.toStruct` or
 * `GroupUtils.toStructs`; grouped encoders derive a shared group id from the
 * offer list, while single-offer encoders read the offer's group unless an
 * explicit override is supplied.
 *
 * @example
 * ```ts
 * import type { OfferStruct } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const offer: OfferStruct = {
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
 *     maturity: 2_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   start: 0n,
 *   expiry: 2_100n,
 *   tick: 5_000n,
 *   group: zeroHash,
 *   callback: zeroAddress,
 *   callbackData: "0x",
 *   receiverIfMakerIsSeller: zeroAddress,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   reduceOnly: false,
 *   maxUnits: 0n,
 *   maxAssets: 100n,
 *   continuousFeeCap: 317097919n,
 * };
 * console.log(offer.group);
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
  /** Maximum market continuous fee accepted by this offer. */
  readonly continuousFeeCap: bigint;
}

/**
 * Parameters for {@link Offer.create}.
 *
 * These are make-side parameters entered by a maker or order-management app
 * before any tree, ratifier data, or mempool payload exists. The optional
 * `group` field is useful when instantiating an offer that already belongs to a
 * protocol group, such as an offer returned by the Midnight API. Omit it for
 * fresh maker-side offers that will be grouped with `Group.create`.
 *
 * @example
 * ```ts
 * import type { BuildOfferParams } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const params: BuildOfferParams = {
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
 *     maturity: 2_000n,
 *     rcfThreshold: 0n,
 *     enterGate: zeroAddress,
 *     liquidatorGate: zeroAddress,
 *   },
 *   buy: true,
 *   maker: "0x0000000000000000000000000000000000009000",
 *   tick: 5_000n,
 *   group: "0x1111111111111111111111111111111111111111111111111111111111111111",
 *   expiry: 2_100n,
 *   ratifier: "0x0000000000000000000000000000000000004000",
 *   maxAssets: 100n,
 * };
 * console.log(params.group);
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
  /**
   * Optional consumption group id for already-grouped offers, such as offers
   * decoded from the API. Omit for fresh maker-side offers.
   */
  readonly group?: Hash;
  /** Market tick spacing; defaults to the protocol's default spacing. */
  readonly tickSpacing?: BigIntish;
  /** Maximum units; defaults to zero. Exactly one of `maxUnits` and `maxAssets` must be non-zero. */
  readonly maxUnits?: BigIntish;
  /** Maximum buyer or seller assets; defaults to zero. Exactly one of `maxUnits` and `maxAssets` must be non-zero. */
  readonly maxAssets?: BigIntish;
  /** Maximum market continuous fee accepted by this offer; defaults to the protocol maximum. */
  readonly continuousFeeCap?: BigIntish;
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

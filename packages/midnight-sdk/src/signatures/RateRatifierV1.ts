import { type BigIntish, deepFreeze, MathLib } from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  type Hash,
  type Hex,
  keccak256,
  zeroAddress,
  zeroHash,
} from "viem";
import { rateRatifierV1Abi } from "../abis.js";
import { RATE_RATIFIER_V1_OFFER_TYPEHASH } from "../constants.js";
import {
  InvalidRateRatifierV1RateError,
  InvalidRateRatifierV1TickError,
  InvalidRateRatifierV1TimeError,
  InvalidTreeError,
} from "../errors.js";
import { MarketUtils } from "../market/index.js";
import { TickLib } from "../math/index.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import { GroupUtils } from "./GroupUtils.js";
import {
  EMPTY_OFFER_STRUCT,
  isEmptyOfferStruct,
  isZeroAddress,
} from "./offerStructInternal.js";
import type { Payload } from "./Payload.js";
import {
  assertRatifierV1Address,
  assertRatifierV1Taker,
  buildRatifierV1Descriptor,
  resolveRatifierV1Tree,
} from "./ratifierV1Internal.js";
import { type TreeProof, TreeUtils } from "./TreeUtils.js";
import type { TreeData, TreeSnapshot } from "./treeTypes.js";

const rateRatifierV1DataAbi = [
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
  { name: "rate", type: "uint256" },
  { name: "allowedTaker", type: "address" },
] as const;

const rateRatifierV1LeafHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "marketHash", type: "bytes32" },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "rate", type: "uint256" },
  { name: "allowedTaker", type: "address" },
  { name: "group", type: "bytes32" },
  { name: "callback", type: "address" },
  { name: "callbackDataHash", type: "bytes32" },
  { name: "receiverIfMakerIsSeller", type: "address" },
  { name: "ratifier", type: "address" },
  { name: "reduceOnly", type: "bool" },
  { name: "maxUnits", type: "uint128" },
  { name: "maxAssets", type: "uint128" },
  { name: "continuousFeeCap", type: "uint256" },
] as const;

const isPaddingEntry = (entry: {
  readonly offer: OfferStruct;
  readonly rate: bigint;
  readonly allowedTaker: Address;
}) =>
  isEmptyOfferStruct(entry.offer) &&
  entry.rate === 0n &&
  isZeroAddress(entry.allowedTaker);

/**
 * One RateRatifierV1 offer leaf.
 *
 * `rate` is the WAD-scaled per-second simple-interest rate the maker offers.
 * `allowedTaker` optionally restricts the offer to one taker; omit it or pass
 * the zero address to let anyone take.
 *
 * @example
 * ```ts
 * import type { IOffer, RateRatifierV1Leaf } from "@morpho-org/midnight-sdk";
 *
 * function leaf(offer: IOffer): RateRatifierV1Leaf {
 *   return { offer, rate: 1_0000000000000000n };
 * }
 * ```
 */
export interface RateRatifierV1Leaf {
  /** Offer carried by the leaf; the offer's `ratifier` must be the RateRatifierV1 address. */
  readonly offer: IOffer;
  /** WAD-scaled per-second rate bound for this leaf. */
  readonly rate: BigIntish;
  /** Optional taker restriction; defaults to the zero address (any taker). */
  readonly allowedTaker?: Address;
}

/**
 * ABI-compatible RateRatifierV1 leaf.
 *
 * @example
 * ```ts
 * import type { OfferStruct, RateRatifierV1LeafStruct } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * function leaf(offer: OfferStruct): RateRatifierV1LeafStruct {
 *   return { offer, rate: 0n, allowedTaker: zeroAddress };
 * }
 * ```
 */
export interface RateRatifierV1LeafStruct {
  /** ABI-compatible offer. */
  readonly offer: OfferStruct;
  /** WAD-scaled per-second rate bound. */
  readonly rate: bigint;
  /** Taker restriction; the zero address means any taker. */
  readonly allowedTaker: Address;
}

/**
 * Fully materialized RateRatifierV1 tree descriptor.
 *
 * Use this shape when a caller needs leaf structs, leaf hashes, root, and
 * height, for example before custom signing or proof generation.
 *
 * @example
 * ```ts
 * import { RateRatifierV1, type IOffer, type RateRatifierV1TreeDescriptor } from "@morpho-org/midnight-sdk";
 *
 * function build(offer: IOffer): RateRatifierV1TreeDescriptor {
 *   return RateRatifierV1.buildDescriptor([{ offer, rate: 0n }]);
 * }
 * ```
 */
export interface RateRatifierV1TreeDescriptor
  extends TreeData<RateRatifierV1LeafStruct> {}

/**
 * Decoded RateRatifierV1 ratifier data.
 *
 * Use this on the take-side or in diagnostics after `Payload.decode` when you
 * need to inspect the proof, rate, and allowed taker attached to a
 * RateRatifierV1-ratified offer.
 *
 * @example
 * ```ts
 * import { RateRatifierV1, type DecodedRateRatifierV1Data } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const data = RateRatifierV1.encodeRatifierData({
 *   root: zeroHash,
 *   leafIndex: 0n,
 *   proof: [],
 *   rate: 0n,
 *   allowedTaker: zeroAddress,
 * });
 * const decoded: DecodedRateRatifierV1Data =
 *   RateRatifierV1.decodeRatifierData(data);
 * console.log(decoded.rate);
 * ```
 */
export interface DecodedRateRatifierV1Data extends TreeProof {
  /** WAD-scaled per-second rate bound proven by the leaf. */
  readonly rate: bigint;
  /** Taker restriction proven by the leaf; the zero address means any taker. */
  readonly allowedTaker: Address;
}

/**
 * Tree-like input accepted by RateRatifierV1 helpers.
 *
 * Both a {@link RateRatifierV1TreeDescriptor} and raw leaf input are
 * accepted; caller-provided descriptors are fully re-validated (leaf hashes
 * and root recomputed) before use.
 *
 * @example
 * ```ts
 * import type { IOffer, RateRatifierV1TreeInput } from "@morpho-org/midnight-sdk";
 *
 * function input(offer: IOffer): RateRatifierV1TreeInput {
 *   return [{ offer, rate: 0n }];
 * }
 * ```
 */
export type RateRatifierV1TreeInput =
  | (RateRatifierV1TreeDescriptor & { readonly type?: undefined })
  | TreeSnapshot<"rateV1">
  | readonly RateRatifierV1Leaf[];

/**
 * RateRatifierV1-specific pure utilities.
 *
 * Use this route when makers ratify a Merkle root of rate-bounded offers
 * onchain. The make-side sequence is: create offers with the RateRatifierV1
 * address, build the tree descriptor, ratify the root onchain (directly or
 * through `setIsRootRatified`), then call `ratify` and pass the returned items
 * to `Payload.encode`.
 *
 * @example
 * ```ts
 * import { RateRatifierV1 } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof RateRatifierV1.ratify);
 * ```
 */
export namespace RateRatifierV1 {
  /**
   * Lowest nominal `offer.tick` the router accepts for a RateRatifierV1 leaf
   * (tick 3372, price >= 0.5 WAD).
   *
   * The router prices RateRatifierV1 offers from `rate`, but its gatekeeper
   * still validates the committed `offer.tick`; ticks below this are rejected
   * as `min_tick`.
   *
   * @example
   * ```ts
   * import { RateRatifierV1 } from "@morpho-org/midnight-sdk";
   *
   * console.log(RateRatifierV1.MIN_TICK); // 3372n
   * ```
   */
  export const MIN_TICK = TickLib.priceToTick(MathLib.WAD / 2n, 1n);

  /**
   * Computes the RateRatifierV1 EIP-712 leaf hash for one leaf struct.
   *
   * This is the SDK port of `HashLib.hashRateRatifierV1Offer`: the offer's
   * `tick` field is replaced by `rate`, and `allowedTaker` is appended.
   *
   * @param leaf - ABI-compatible leaf to hash.
   * @returns Leaf hash used in the ratified Merkle tree.
   * @example
   * ```ts
   * import { RateRatifierV1, type OfferStruct } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * function hash(offer: OfferStruct) {
   *   return RateRatifierV1.hashLeaf({
   *     offer,
   *     rate: 0n,
   *     allowedTaker: zeroAddress,
   *   });
   * }
   * ```
   */
  export function hashLeaf(leaf: RateRatifierV1LeafStruct): Hash {
    const { offer } = leaf;

    return keccak256(
      encodeAbiParameters(rateRatifierV1LeafHashParams, [
        RATE_RATIFIER_V1_OFFER_TYPEHASH,
        MarketUtils.hash(offer.market),
        offer.buy,
        offer.maker,
        offer.start,
        offer.expiry,
        leaf.rate,
        leaf.allowedTaker,
        offer.group,
        offer.callback,
        keccak256(offer.callbackData),
        offer.receiverIfMakerIsSeller,
        offer.ratifier,
        offer.reduceOnly,
        offer.maxUnits,
        offer.maxAssets,
        offer.continuousFeeCap,
      ]),
    );
  }

  /**
   * Zero-group member hash of one leaf, as consumed by `GroupUtils.hashMembers`.
   *
   * This is what the router recomputes for its `group_identity` check: the
   * RateRatifierV1 leaf hash with `group = 0`, so the id commits to `rate`
   * and `allowedTaker` rather than to `tick`.
   *
   * @param leaf - Rate-bounded offer leaf.
   * @returns Zero-group RateRatifierV1 leaf hash.
   * @throws {InvalidRateRatifierV1RateError} when `leaf.rate` is negative.
   * @example
   * ```ts
   * import { Offer, RateRatifierV1 } from "@morpho-org/midnight-sdk";
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
   *   ratifier: "0x000000000000000000000000000000000000a111",
   *   maxUnits: 100n,
   * });
   *
   * console.log(RateRatifierV1.memberHash({ offer, rate: 0n }));
   * ```
   */
  export function memberHash(leaf: RateRatifierV1Leaf): Hash {
    const rate = BigInt(leaf.rate);
    if (rate < 0n) throw new InvalidRateRatifierV1RateError(rate);

    return hashLeaf({
      offer: OfferUtils.toStruct({ offer: leaf.offer, group: zeroHash }),
      rate,
      allowedTaker: leaf.allowedTaker ?? zeroAddress,
    });
  }

  /**
   * Content-addressed consumption group id for RateRatifierV1 leaves.
   *
   * Mirrors `GroupUtils.hash` with the RateRatifierV1 {@link memberHash}, so
   * it matches the router-derived group. Use it to share one group across
   * several leaves; single leaves get this id by default in
   * {@link buildDescriptor}. Leaves sharing a group must satisfy the same
   * constraints as `Group.create` (one maker, side, and cap mode/value); this
   * helper only derives the id and does not check them.
   *
   * @param leaves - Leaves sharing one consumption group.
   * @returns Content-addressed group id.
   * @throws {InvalidOfferGroupError} when `leaves` is empty.
   * @throws {InvalidRateRatifierV1RateError} when a leaf rate is negative.
   * @example
   * ```ts
   * import { Offer, RateRatifierV1 } from "@morpho-org/midnight-sdk";
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
   *   ratifier: "0x000000000000000000000000000000000000a111",
   *   maxUnits: 100n,
   * });
   * const leaves = [
   *   { offer, rate: 50_000_000_000_000_000n },
   *   { offer: Offer.from({ ...offer, tick: 5_004n }), rate: 60_000_000_000_000_000n },
   * ];
   *
   * const group = RateRatifierV1.groupId(leaves);
   * const grouped = leaves.map((leaf) => ({
   *   ...leaf,
   *   offer: Offer.from({ ...leaf.offer, group }),
   * }));
   * ```
   */
  export function groupId(leaves: Iterable<RateRatifierV1Leaf>): Hash {
    return GroupUtils.hashMembers(Array.from(leaves, memberHash));
  }

  /**
   * Builds a RateRatifierV1 tree descriptor from leaf input.
   *
   * Non-power-of-two leaf lists are padded with protocol-zero leaves at the
   * highest leaf indices. An explicit `group` is committed as-is; an omitted
   * `group` defaults to the leaf's content-addressed singleton
   * {@link groupId}, which commits to `rate` and `allowedTaker` like the
   * router does. Explicit groups must come from {@link groupId}; ids from
   * `Group.create` / `GroupUtils.hash` use the protocol offer hash and are
   * rejected by the router's `group_identity` rule.
   *
   * @param leaves - Rate-bounded offer leaves in leaf order.
   * @returns RateRatifierV1 tree descriptor.
   * @throws {InvalidTreeError} when the leaf list is empty, contains duplicate leaf hashes, or mixes ratifier addresses.
   * @throws {InvalidRateRatifierV1RateError} when a leaf rate is negative.
   * @throws {InvalidRateRatifierV1TickError} when a leaf offer tick is below {@link MIN_TICK}.
   * @throws {InvalidTreeHeightError} when the padded tree exceeds supported ratifier typehashes.
   * @example
   * ```ts
   * import { RateRatifierV1, type IOffer } from "@morpho-org/midnight-sdk";
   *
   * function build(offer: IOffer) {
   *   return RateRatifierV1.buildDescriptor([{ offer, rate: 0n }]);
   * }
   * ```
   */
  export function buildDescriptor(
    leaves: readonly RateRatifierV1Leaf[],
  ): RateRatifierV1TreeDescriptor {
    const offers: Offer[] = [];
    const structs = leaves.map((leaf) => {
      const rate = BigInt(leaf.rate);
      if (rate < 0n) throw new InvalidRateRatifierV1RateError(rate);

      const allowedTaker = leaf.allowedTaker ?? zeroAddress;
      const input = Offer.from(leaf.offer);
      if (input.tick < MIN_TICK)
        throw new InvalidRateRatifierV1TickError(input.tick, MIN_TICK);

      const offer = input.hasExplicitGroup
        ? input
        : Offer.from({
            ...input,
            group: groupId([{ offer: input, rate, allowedTaker }]),
          });
      offers.push(offer);

      return { offer: OfferUtils.toStruct({ offer }), rate, allowedTaker };
    });

    const descriptor = buildRatifierV1Descriptor({
      entries: structs,
      padding: {
        offer: EMPTY_OFFER_STRUCT,
        rate: 0n,
        allowedTaker: zeroAddress,
      },
      hashLeaf,
      ratifierOf: (leafStruct) => leafStruct.offer.ratifier,
      label: "RateRatifierV1",
    });

    return Object.freeze({
      entries: deepFreeze(descriptor.entries),
      leaves: deepFreeze(descriptor.leaves),
      root: descriptor.root,
      height: descriptor.height,
      offers: Object.freeze([...offers]),
    });
  }

  const treeHelpers = {
    buildDescriptor,
    hashLeaf,
    isPadding: isPaddingEntry,
    ratifierOf: (leafStruct: RateRatifierV1LeafStruct) =>
      leafStruct.offer.ratifier,
    validateEntry: (entry: RateRatifierV1LeafStruct) => {
      if (entry.offer.tick < MIN_TICK)
        throw new InvalidRateRatifierV1TickError(entry.offer.tick, MIN_TICK);
    },
    label: "RateRatifierV1",
    type: "rateV1",
  } as const;

  /**
   * Builds a Merkle proof for one RateRatifierV1 leaf.
   *
   * @param params.tree - RateRatifierV1 tree descriptor or raw leaf input.
   * @param params.leafIndex - Leaf index to prove.
   * @returns Proof descriptor.
   * @throws {InvalidTreeError} when the tree is invalid or the leaf index is out of range.
   * @throws {InvalidTreeHeightError} when the tree exceeds the supported height.
   * @throws {InvalidRateRatifierV1RateError} when a raw leaf carries a negative rate.
   * @throws {InvalidRateRatifierV1TickError} when a leaf offer tick is below {@link MIN_TICK}, including inside a caller-supplied descriptor.
   * @example
   * ```ts
   * import { RateRatifierV1, type IOffer } from "@morpho-org/midnight-sdk";
   *
   * function build(offer: IOffer) {
   *   return RateRatifierV1.buildProof({
   *     tree: RateRatifierV1.buildDescriptor([{ offer, rate: 0n }]),
   *     leafIndex: 0n,
   *   });
   * }
   * ```
   */
  export function buildProof(params: {
    readonly tree: RateRatifierV1TreeInput;
    readonly leafIndex: BigIntish;
  }): TreeProof {
    const tree = resolveRatifierV1Tree(params.tree, treeHelpers);

    return TreeUtils.buildProof({ tree, leafIndex: params.leafIndex });
  }

  /**
   * Encodes RateRatifierV1 ratifier data.
   *
   * Use only when you already have a root, proof, rate, and allowed taker.
   * Most maker flows call `ratifierData` for one leaf or `ratify` for every
   * leaf in the ratified tree.
   *
   * @param params.root - Merkle root ratified by the maker's RateRatifierV1.
   * @param params.leafIndex - Leaf index proven by `params.proof`.
   * @param params.proof - Merkle proof siblings for the leaf.
   * @param params.rate - WAD-scaled per-second rate bound carried by the leaf.
   * @param params.allowedTaker - Taker restriction carried by the leaf.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { RateRatifierV1 } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const data = RateRatifierV1.encodeRatifierData({
   *   root: zeroHash,
   *   leafIndex: 0n,
   *   proof: [],
   *   rate: 0n,
   *   allowedTaker: zeroAddress,
   * });
   * console.log(data);
   * ```
   */
  export function encodeRatifierData(params: {
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
    readonly rate: BigIntish;
    readonly allowedTaker: Address;
  }) {
    return encodeAbiParameters(rateRatifierV1DataAbi, [
      params.root,
      BigInt(params.leafIndex),
      params.proof,
      BigInt(params.rate),
      params.allowedTaker,
    ]);
  }

  /**
   * Decodes RateRatifierV1 ratifier data.
   *
   * Use on the take-side or in tests after `Payload.decode` to inspect the
   * proof, rate, and allowed taker attached to a published offer.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded RateRatifierV1 ratifier data.
   * @example
   * ```ts
   * import { RateRatifierV1 } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const decoded = RateRatifierV1.decodeRatifierData(
   *   RateRatifierV1.encodeRatifierData({
   *     root: zeroHash,
   *     leafIndex: 0n,
   *     proof: [],
   *     rate: 0n,
   *     allowedTaker: zeroAddress,
   *   }),
   * );
   * console.log(decoded.rate);
   * ```
   */
  export function decodeRatifierData(data: Hex): DecodedRateRatifierV1Data {
    const [root, leafIndex, proof, rate, allowedTaker] = decodeAbiParameters(
      rateRatifierV1DataAbi,
      data,
    );

    return deepFreeze({
      root,
      leafIndex,
      proof: [...proof],
      rate,
      allowedTaker,
    });
  }

  /**
   * Verifies that RateRatifierV1 ratifier data proves one payload offer
   * belongs to its root.
   *
   * This helper intentionally does not check the onchain
   * `RateRatifierV1.ratification` state or the rate-implied price bound.
   * Consumers can query those values at their own block context after local
   * proof verification.
   *
   * @param params.offer - Offer carried by the payload item.
   * @param params.ratifierData - ABI-encoded RateRatifierV1 ratifier data.
   * @param params.taker - Optional taker to check against the leaf's allowed taker.
   * @returns Decoded RateRatifierV1 ratifier data after proof verification.
   * @throws {InvalidTreeError} when the proof does not include `offer` in `root`.
   * @throws {RatifierV1TakerNotAllowedError} when `taker` is not the leaf's allowed taker.
   * @example
   * ```ts
   * import { RateRatifierV1, type IOffer } from "@morpho-org/midnight-sdk";
   * import type { Hex } from "viem";
   *
   * function check(offer: IOffer, ratifierData: Hex) {
   *   return RateRatifierV1.verifyRatifierData({ offer, ratifierData });
   * }
   * ```
   */
  export function verifyRatifierData(params: {
    readonly offer: IOffer;
    readonly ratifierData: Hex;
    readonly taker?: Address;
  }): DecodedRateRatifierV1Data {
    const decoded = decodeRatifierData(params.ratifierData);
    const leaf = hashLeaf({
      offer: OfferUtils.toStruct({ offer: Offer.from(params.offer) }),
      rate: decoded.rate,
      allowedTaker: decoded.allowedTaker,
    });
    if (
      !TreeUtils.verifyLeafProof({
        leaf,
        root: decoded.root,
        leafIndex: decoded.leafIndex,
        proof: decoded.proof,
      })
    ) {
      throw new InvalidTreeError("Ratifier data proof does not include offer.");
    }

    assertRatifierV1Taker({
      taker: params.taker,
      allowedTaker: decoded.allowedTaker,
    });

    return decoded;
  }

  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * Use after root ratification when a caller needs data for one offer leaf.
   * Use `ratify` to produce payload-ready items for the whole tree.
   *
   * @param params.tree - RateRatifierV1 tree descriptor or raw leaf input.
   * @param params.leafIndex - Leaf index to prove.
   * @returns ABI-encoded RateRatifierV1 data.
   * @throws {InvalidTreeError} when the tree is invalid, the leaf index is outside the tree, or the tree contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree exceeds the supported height.
   * @throws {InvalidRateRatifierV1RateError} when a raw leaf carries a negative rate.
   * @throws {InvalidRateRatifierV1TickError} when a leaf offer tick is below {@link MIN_TICK}, including inside a caller-supplied descriptor.
   * @example
   * ```ts
   * import { RateRatifierV1, type IOffer } from "@morpho-org/midnight-sdk";
   *
   * function build(offer: IOffer) {
   *   return RateRatifierV1.ratifierData({
   *     tree: [{ offer, rate: 0n }],
   *     leafIndex: 0n,
   *   });
   * }
   * ```
   */
  export function ratifierData(params: {
    readonly tree: RateRatifierV1TreeInput;
    readonly leafIndex: BigIntish;
  }): Hex {
    const tree = resolveRatifierV1Tree(params.tree, treeHelpers);
    const proof = TreeUtils.buildProof({ tree, leafIndex: params.leafIndex });
    const entry = tree.entries[Number(proof.leafIndex)]!;

    return encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
      rate: entry.rate,
      allowedTaker: entry.allowedTaker,
    });
  }

  /**
   * Returns payload-ready items after a RateRatifierV1 root has been ratified.
   *
   * Use after the root ratification transaction has been submitted for every
   * maker in the tree. The returned items can be passed directly to
   * `Payload.encode`. All offers in the tree must use one ratifier address;
   * build separate trees per ratifier.
   *
   * @param params.tree - RateRatifierV1 tree descriptor or raw leaf input whose root has already been ratified onchain.
   * @returns Items containing each non-padding offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree exceeds the supported height.
   * @throws {InvalidRateRatifierV1RateError} when a raw leaf carries a negative rate.
   * @throws {InvalidRateRatifierV1TickError} when a leaf offer tick is below {@link MIN_TICK}, including inside a caller-supplied descriptor.
   * @example
   * ```ts
   * import { RateRatifierV1, type IOffer } from "@morpho-org/midnight-sdk";
   *
   * function build(offer: IOffer) {
   *   return RateRatifierV1.ratify({
   *     tree: [{ offer, rate: 0n }],
   *   });
   * }
   * ```
   */
  export function ratify(params: {
    readonly tree: RateRatifierV1TreeInput;
  }): readonly Payload.Item[] {
    const tree = resolveRatifierV1Tree(params.tree, treeHelpers);

    const proofs = TreeUtils.buildProofs({
      tree,
      count: tree.offers.length,
    });

    return tree.offers.map((offer, leafIndex) => {
      const entry = tree.entries[leafIndex]!;
      const proof = proofs[leafIndex]!;

      return {
        offer,
        ratifierData: encodeRatifierData({
          root: proof.root,
          leafIndex: proof.leafIndex,
          proof: proof.proof,
          rate: entry.rate,
          allowedTaker: entry.allowedTaker,
        }),
      };
    });
  }

  /**
   * Converts a WAD-scaled per-second rate into the price bound used by
   * `RateRatifierV1.isRatified`.
   *
   * The bound is `WAD * WAD / (WAD + rate * timeToMaturity)`, rounded down
   * for buy offers and up for sell offers, matching the onchain comparison
   * direction.
   *
   * @param params.rate - WAD-scaled per-second rate.
   * @param params.timeToMaturity - Seconds remaining until market maturity.
   * @param params.buy - Whether the maker buys units.
   * @returns WAD-scaled price bound.
   * @throws {InvalidRateRatifierV1RateError} when `rate` is negative.
   * @throws {InvalidRateRatifierV1TimeError} when `timeToMaturity` is negative.
   * @example
   * ```ts
   * import { RateRatifierV1 } from "@morpho-org/midnight-sdk";
   *
   * const bound = RateRatifierV1.priceBound({
   *   rate: 0n,
   *   timeToMaturity: 0n,
   *   buy: true,
   * });
   * console.log(bound);
   * ```
   */
  export function priceBound(params: {
    readonly rate: BigIntish;
    readonly timeToMaturity: BigIntish;
    readonly buy: boolean;
  }): bigint {
    const rate = BigInt(params.rate);
    if (rate < 0n) throw new InvalidRateRatifierV1RateError(rate);
    const timeToMaturity = BigInt(params.timeToMaturity);
    if (timeToMaturity < 0n) {
      throw new InvalidRateRatifierV1TimeError(
        timeToMaturity,
        "timeToMaturity",
      );
    }

    const denominator = MathLib.WAD + rate * timeToMaturity;

    return params.buy
      ? MathLib.mulDivDown(MathLib.WAD, MathLib.WAD, denominator)
      : MathLib.mulDivUp(MathLib.WAD, MathLib.WAD, denominator);
  }

  /**
   * Checks whether an offer's tick satisfies its rate bound at a timestamp.
   *
   * Mirrors `RateRatifierV1.isRatified`: the offer price must be at or below
   * the rate-implied bound for buy offers, and at or above it for sell
   * offers. Time to maturity floors at zero.
   *
   * @param params.offer - Offer whose `tick`, `buy`, and `market.maturity` are checked.
   * @param params.rate - WAD-scaled per-second rate bound proven by the leaf.
   * @param params.timestamp - Timestamp at which acceptance is evaluated.
   * @returns Whether the offer's tick price satisfies the rate bound.
   * @throws {InvalidRateRatifierV1RateError} when `rate` is negative.
   * @throws {InvalidRateRatifierV1TimeError} when `timestamp` is negative.
   * @throws {NegativeValueError} when `offer.tick` is negative.
   * @throws {TickOutOfRangeError} when `offer.tick` exceeds `MAX_TICK`.
   * @example
   * ```ts
   * import { RateRatifierV1, type IOffer } from "@morpho-org/midnight-sdk";
   *
   * function check(offer: IOffer) {
   *   return RateRatifierV1.isPriceAcceptable({
   *     offer,
   *     rate: 0n,
   *     timestamp: 0n,
   *   });
   * }
   * ```
   */
  export function isPriceAcceptable(params: {
    readonly offer: Pick<IOffer, "tick" | "buy" | "market">;
    readonly rate: BigIntish;
    readonly timestamp: BigIntish;
  }): boolean {
    const timestamp = BigInt(params.timestamp);
    if (timestamp < 0n) {
      throw new InvalidRateRatifierV1TimeError(timestamp, "timestamp");
    }
    const maturity = BigInt(
      "params" in params.offer.market
        ? params.offer.market.params.maturity
        : params.offer.market.maturity,
    );
    const timeToMaturity = maturity - timestamp;
    const bound = priceBound({
      rate: params.rate,
      timeToMaturity: timeToMaturity > 0n ? timeToMaturity : 0n,
      buy: params.offer.buy,
    });
    const offerPrice = TickLib.tickToPrice(params.offer.tick);

    return params.offer.buy ? offerPrice <= bound : offerPrice >= bound;
  }

  /**
   * Encodes a `setIsRootRatified` call to a RateRatifierV1 contract.
   *
   * Onchain, the caller must be the maker or an address authorized by the
   * maker on the Midnight instance. The returned descriptor is neutral and
   * never signs or submits anything.
   *
   * @param params.ratifier - RateRatifierV1 contract address.
   * @param params.maker - Maker whose ratification entry is updated.
   * @param params.root - Merkle root to ratify or unratify.
   * @param params.isRatified - New ratification flag for the root.
   * @returns Neutral call descriptor.
   * @throws {InvalidRatifierV1AddressError} when the ratifier address is the zero address.
   * @example
   * ```ts
   * import { RateRatifierV1 } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const call = RateRatifierV1.encodeSetIsRootRatified({
   *   ratifier: "0x0000000000000000000000000000000000000001",
   *   maker: zeroAddress,
   *   root: zeroHash,
   *   isRatified: true,
   * });
   * console.log(call.to);
   * ```
   */
  export function encodeSetIsRootRatified(params: {
    readonly ratifier: Address;
    readonly maker: Address;
    readonly root: Hash;
    readonly isRatified: boolean;
  }) {
    assertRatifierV1Address(params.ratifier);
    return deepFreeze({
      to: params.ratifier,
      data: encodeFunctionData({
        abi: rateRatifierV1Abi,
        functionName: "setIsRootRatified",
        args: [params.maker, params.root, params.isRatified],
      }),
    });
  }
}

/** @deprecated Use {@link RateRatifierV1}. Retained for compatibility. */
export { RateRatifierV1 as RateRatifierV1Utils };

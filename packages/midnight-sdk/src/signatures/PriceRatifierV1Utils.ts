import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  type Hash,
  type Hex,
  keccak256,
  zeroAddress,
} from "viem";
import { priceRatifierV1Abi } from "../abis.js";
import { PRICE_RATIFIER_V1_OFFER_TYPEHASH } from "../constants.js";
import { InvalidTreeError } from "../errors.js";
import { MarketUtils } from "../market/index.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
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

const priceRatifierV1DataAbi = [
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
  { name: "allowedTaker", type: "address" },
] as const;

const priceRatifierV1LeafHashParams = [
  { name: "typehash", type: "bytes32" },
  { name: "marketHash", type: "bytes32" },
  { name: "buy", type: "bool" },
  { name: "maker", type: "address" },
  { name: "start", type: "uint256" },
  { name: "expiry", type: "uint256" },
  { name: "tick", type: "uint256" },
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
  readonly allowedTaker: Address;
}) => isEmptyOfferStruct(entry.offer) && isZeroAddress(entry.allowedTaker);

/**
 * One PriceRatifierV1 offer leaf.
 *
 * `allowedTaker` optionally restricts the offer to one taker; omit it or pass
 * the zero address to let anyone take.
 *
 * @example
 * ```ts
 * import type { PriceRatifierV1Leaf } from "@morpho-org/midnight-sdk";
 *
 * const leaf: PriceRatifierV1Leaf = { offer };
 * console.log(leaf.offer);
 * ```
 */
export interface PriceRatifierV1Leaf {
  /** Offer carried by the leaf; the offer's `ratifier` must be the PriceRatifierV1 address. */
  readonly offer: IOffer;
  /** Optional taker restriction; defaults to the zero address (any taker). */
  readonly allowedTaker?: Address;
}

/**
 * ABI-compatible PriceRatifierV1 leaf.
 *
 * @example
 * ```ts
 * import type { PriceRatifierV1LeafStruct } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const leaf: PriceRatifierV1LeafStruct = {
 *   offer,
 *   allowedTaker: zeroAddress,
 * };
 * console.log(leaf.allowedTaker);
 * ```
 */
export interface PriceRatifierV1LeafStruct {
  /** ABI-compatible offer. */
  readonly offer: OfferStruct;
  /** Taker restriction; the zero address means any taker. */
  readonly allowedTaker: Address;
}

/**
 * Fully materialized PriceRatifierV1 tree descriptor.
 *
 * Use this shape when a caller needs leaf structs, leaf hashes, root, and
 * height, for example before custom signing or proof generation.
 *
 * @example
 * ```ts
 * import { PriceRatifierV1Utils, type PriceRatifierV1TreeDescriptor } from "@morpho-org/midnight-sdk";
 *
 * const descriptor: PriceRatifierV1TreeDescriptor =
 *   PriceRatifierV1Utils.buildDescriptor([{ offer }]);
 * console.log(descriptor.root);
 * ```
 */
export interface PriceRatifierV1TreeDescriptor {
  /** Leaf structs in leaf order, including trailing padding. */
  readonly entries: readonly PriceRatifierV1LeafStruct[];
  /** Non-padding offers in leaf order. */
  readonly offers: readonly IOffer[];
  /** Leaf hashes for the padded tree. */
  readonly leaves: readonly Hash[];
  /** Merkle root. */
  readonly root: Hash;
  /** Tree height. */
  readonly height: number;
}

/**
 * Decoded PriceRatifierV1 ratifier data.
 *
 * Use this on the take-side or in diagnostics after `Payload.decode` when you
 * need to inspect the proof and allowed taker attached to a
 * PriceRatifierV1-ratified offer.
 *
 * @example
 * ```ts
 * import { PriceRatifierV1Utils, type DecodedPriceRatifierV1Data } from "@morpho-org/midnight-sdk";
 * import { zeroAddress, zeroHash } from "viem";
 *
 * const data = PriceRatifierV1Utils.encodeRatifierData({
 *   root: zeroHash,
 *   leafIndex: 0n,
 *   proof: [],
 *   allowedTaker: zeroAddress,
 * });
 * const decoded: DecodedPriceRatifierV1Data =
 *   PriceRatifierV1Utils.decodeRatifierData(data);
 * console.log(decoded.allowedTaker);
 * ```
 */
export interface DecodedPriceRatifierV1Data extends TreeProof {
  /** Taker restriction proven by the leaf; the zero address means any taker. */
  readonly allowedTaker: Address;
}

/**
 * Tree-like input accepted by PriceRatifierV1 helpers.
 *
 * Both a {@link PriceRatifierV1TreeDescriptor} and raw leaf input are
 * accepted; caller-provided descriptors are fully re-validated (leaf hashes
 * and root recomputed) before use.
 *
 * @example
 * ```ts
 * import type { PriceRatifierV1TreeInput } from "@morpho-org/midnight-sdk";
 *
 * const input: PriceRatifierV1TreeInput = [{ offer }];
 * console.log(input);
 * ```
 */
export type PriceRatifierV1TreeInput =
  | PriceRatifierV1TreeDescriptor
  | readonly PriceRatifierV1Leaf[];

/**
 * PriceRatifierV1-specific pure utilities.
 *
 * Use this route when makers ratify a Merkle root of price-bounded offers
 * onchain. The make-side sequence is: create offers with the PriceRatifierV1
 * address, build the tree descriptor, ratify the root onchain (directly or
 * through `setIsRootRatified`), then call `ratify` and pass the returned items
 * to `Payload.encode`.
 *
 * @example
 * ```ts
 * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof PriceRatifierV1Utils.ratify);
 * ```
 */
export namespace PriceRatifierV1Utils {
  /**
   * Computes the PriceRatifierV1 EIP-712 leaf hash for one leaf struct.
   *
   * This is the SDK port of `HashLib.hashPriceRatifierV1Offer`: the offer's
   * `tick` is kept and `allowedTaker` is appended after it.
   *
   * @param leaf - ABI-compatible leaf to hash.
   * @returns Leaf hash used in the ratified Merkle tree.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const leaf = PriceRatifierV1Utils.hashLeaf({
   *   offer,
   *   allowedTaker: zeroAddress,
   * });
   * console.log(leaf);
   * ```
   */
  export function hashLeaf(leaf: PriceRatifierV1LeafStruct): Hash {
    const { offer } = leaf;

    return keccak256(
      encodeAbiParameters(priceRatifierV1LeafHashParams, [
        PRICE_RATIFIER_V1_OFFER_TYPEHASH,
        MarketUtils.hash(offer.market),
        offer.buy,
        offer.maker,
        offer.start,
        offer.expiry,
        offer.tick,
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
   * Builds a PriceRatifierV1 tree descriptor from leaf input.
   *
   * Non-power-of-two leaf lists are padded with protocol-zero leaves at the
   * highest leaf indices. An explicit `group` is committed as-is; only an
   * omitted `group` defaults to the offer's content-addressed singleton group
   * id derived by `Offer.from`.
   *
   * @param leaves - Price-bounded offer leaves in leaf order.
   * @returns PriceRatifierV1 tree descriptor.
   * @throws {InvalidTreeError} when the leaf list is empty, contains duplicate leaf hashes, or mixes ratifier addresses.
   * @throws {InvalidTreeHeightError} when the padded tree exceeds supported ratifier typehashes.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   *
   * const descriptor = PriceRatifierV1Utils.buildDescriptor([{ offer }]);
   * console.log(descriptor.height);
   * ```
   */
  export function buildDescriptor(
    leaves: readonly PriceRatifierV1Leaf[],
  ): PriceRatifierV1TreeDescriptor {
    const offers: Offer[] = [];
    const structs = leaves.map((leaf) => {
      const offer = Offer.from(leaf.offer);
      offers.push(offer);

      return {
        offer: OfferUtils.toStruct({ offer }),
        allowedTaker: leaf.allowedTaker ?? zeroAddress,
      };
    });

    const descriptor = buildRatifierV1Descriptor({
      entries: structs,
      padding: { offer: EMPTY_OFFER_STRUCT, allowedTaker: zeroAddress },
      hashLeaf,
      ratifierOf: (leafStruct) => leafStruct.offer.ratifier,
      label: "PriceRatifierV1",
    });

    return Object.freeze({
      entries: deepFreeze(descriptor.entries),
      leaves: deepFreeze(descriptor.leaves),
      root: descriptor.root,
      height: descriptor.height,
      offers: Object.freeze([...offers]),
    });
  }

  /**
   * Builds a Merkle proof for one PriceRatifierV1 leaf.
   *
   * @param params.tree - PriceRatifierV1 tree descriptor or raw leaf input.
   * @param params.leafIndex - Leaf index to prove.
   * @returns Proof descriptor.
   * @throws {InvalidTreeError} when the tree is invalid or the leaf index is out of range.
   * @throws {InvalidTreeHeightError} when the tree exceeds the supported height.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   *
   * const proof = PriceRatifierV1Utils.buildProof({
   *   tree: PriceRatifierV1Utils.buildDescriptor([{ offer }]),
   *   leafIndex: 0n,
   * });
   * console.log(proof.proof.length);
   * ```
   */
  export function buildProof(params: {
    readonly tree: PriceRatifierV1TreeInput;
    readonly leafIndex: BigIntish;
  }): TreeProof {
    const tree = resolveRatifierV1Tree(params.tree, {
      buildDescriptor,
      hashLeaf,
      isPadding: isPaddingEntry,
      ratifierOf: (leafStruct) => leafStruct.offer.ratifier,
      label: "PriceRatifierV1",
    });

    return TreeUtils.buildProof({ tree, leafIndex: params.leafIndex });
  }

  /**
   * Encodes PriceRatifierV1 ratifier data.
   *
   * Use only when you already have a root, proof, and allowed taker. Most
   * maker flows call `ratifierData` for one leaf or `ratify` for every leaf
   * in the ratified tree.
   *
   * @param params.root - Merkle root ratified by the maker's PriceRatifierV1.
   * @param params.leafIndex - Leaf index proven by `params.proof`.
   * @param params.proof - Merkle proof siblings for the leaf.
   * @param params.allowedTaker - Taker restriction carried by the leaf.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const data = PriceRatifierV1Utils.encodeRatifierData({
   *   root: zeroHash,
   *   leafIndex: 0n,
   *   proof: [],
   *   allowedTaker: zeroAddress,
   * });
   * console.log(data);
   * ```
   */
  export function encodeRatifierData(params: {
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
    readonly allowedTaker: Address;
  }) {
    return encodeAbiParameters(priceRatifierV1DataAbi, [
      params.root,
      BigInt(params.leafIndex),
      params.proof,
      params.allowedTaker,
    ]);
  }

  /**
   * Decodes PriceRatifierV1 ratifier data.
   *
   * Use on the take-side or in tests after `Payload.decode` to inspect the
   * proof and allowed taker attached to a published offer.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded PriceRatifierV1 ratifier data.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const decoded = PriceRatifierV1Utils.decodeRatifierData(
   *   PriceRatifierV1Utils.encodeRatifierData({
   *     root: zeroHash,
   *     leafIndex: 0n,
   *     proof: [],
   *     allowedTaker: zeroAddress,
   *   }),
   * );
   * console.log(decoded.allowedTaker);
   * ```
   */
  export function decodeRatifierData(data: Hex): DecodedPriceRatifierV1Data {
    const [root, leafIndex, proof, allowedTaker] = decodeAbiParameters(
      priceRatifierV1DataAbi,
      data,
    );

    return deepFreeze({ root, leafIndex, proof: [...proof], allowedTaker });
  }

  /**
   * Verifies that PriceRatifierV1 ratifier data proves one payload offer
   * belongs to its root.
   *
   * This helper intentionally does not check the onchain
   * `PriceRatifierV1.ratification` state. Consumers can query that value at
   * their own block context after local proof verification.
   *
   * @param params.offer - Offer carried by the payload item.
   * @param params.ratifierData - ABI-encoded PriceRatifierV1 ratifier data.
   * @param params.taker - Optional taker to check against the leaf's allowed taker.
   * @returns Decoded PriceRatifierV1 ratifier data after proof verification.
   * @throws {InvalidTreeError} when the proof does not include `offer` in `root`.
   * @throws {RatifierV1TakerNotAllowedError} when `taker` is not the leaf's allowed taker.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   *
   * const decoded = PriceRatifierV1Utils.verifyRatifierData({
   *   offer,
   *   ratifierData,
   * });
   * console.log(decoded.root);
   * ```
   */
  export function verifyRatifierData(params: {
    readonly offer: IOffer;
    readonly ratifierData: Hex;
    readonly taker?: Address;
  }): DecodedPriceRatifierV1Data {
    const decoded = decodeRatifierData(params.ratifierData);
    const leaf = hashLeaf({
      offer: OfferUtils.toStruct({ offer: Offer.from(params.offer) }),
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
   * @param params.tree - PriceRatifierV1 tree descriptor or raw leaf input.
   * @param params.leafIndex - Leaf index to prove.
   * @returns ABI-encoded PriceRatifierV1 data.
   * @throws {InvalidTreeError} when the tree is invalid, the leaf index is outside the tree, or the tree contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree exceeds the supported height.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   *
   * const data = PriceRatifierV1Utils.ratifierData({
   *   tree: [{ offer }],
   *   leafIndex: 0n,
   * });
   * console.log(data);
   * ```
   */
  export function ratifierData(params: {
    readonly tree: PriceRatifierV1TreeInput;
    readonly leafIndex: BigIntish;
  }): Hex {
    const tree = resolveRatifierV1Tree(params.tree, {
      buildDescriptor,
      hashLeaf,
      isPadding: isPaddingEntry,
      ratifierOf: (leafStruct) => leafStruct.offer.ratifier,
      label: "PriceRatifierV1",
    });
    const proof = TreeUtils.buildProof({ tree, leafIndex: params.leafIndex });
    const entry = tree.entries[Number(proof.leafIndex)]!;

    return encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
      allowedTaker: entry.allowedTaker,
    });
  }

  /**
   * Returns payload-ready items after a PriceRatifierV1 root has been ratified.
   *
   * Use after the root ratification transaction has been submitted for every
   * maker in the tree. The returned items can be passed directly to
   * `Payload.encode`. All offers in the tree must use one ratifier address;
   * build separate trees per ratifier.
   *
   * @param params.tree - PriceRatifierV1 tree descriptor or raw leaf input whose root has already been ratified onchain.
   * @returns Items containing each non-padding offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when the tree exceeds the supported height.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   *
   * const items = PriceRatifierV1Utils.ratify({
   *   tree: [{ offer }],
   * });
   * console.log(items.length);
   * ```
   */
  export function ratify(params: {
    readonly tree: PriceRatifierV1TreeInput;
  }): readonly Payload.Item[] {
    const tree = resolveRatifierV1Tree(params.tree, {
      buildDescriptor,
      hashLeaf,
      isPadding: isPaddingEntry,
      ratifierOf: (leafStruct) => leafStruct.offer.ratifier,
      label: "PriceRatifierV1",
    });

    return tree.offers.map((offer, leafIndex) => {
      const entry = tree.entries[leafIndex]!;
      const proof = TreeUtils.buildProof({ tree, leafIndex });

      return {
        offer,
        ratifierData: encodeRatifierData({
          root: proof.root,
          leafIndex: proof.leafIndex,
          proof: proof.proof,
          allowedTaker: entry.allowedTaker,
        }),
      };
    });
  }

  /**
   * Encodes a `setIsRootRatified` call to a PriceRatifierV1 contract.
   *
   * Onchain, the caller must be the maker or an address authorized by the
   * maker on the Midnight instance. The returned descriptor is neutral and
   * never signs or submits anything.
   *
   * @param params.ratifier - PriceRatifierV1 contract address.
   * @param params.maker - Maker whose ratification entry is updated.
   * @param params.root - Merkle root to ratify or unratify.
   * @param params.isRatified - New ratification flag for the root.
   * @returns Neutral call descriptor.
   * @throws {InvalidRatifierV1AddressError} when the ratifier address is the zero address.
   * @example
   * ```ts
   * import { PriceRatifierV1Utils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress, zeroHash } from "viem";
   *
   * const call = PriceRatifierV1Utils.encodeSetIsRootRatified({
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
        abi: priceRatifierV1Abi,
        functionName: "setIsRootRatified",
        args: [params.maker, params.root, params.isRatified],
      }),
    });
  }
}

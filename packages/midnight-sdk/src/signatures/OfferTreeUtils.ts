import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import { concat, type Hash, keccak256 } from "viem";
import {
  InvalidOfferGroupError,
  InvalidOfferTreeError,
  InvalidOfferTreeHeightError,
} from "../errors.js";
import { type Offer, type OfferStruct, OfferUtils } from "../offers/index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const comparableHex = (value: string) => value.toLowerCase();

/**
 * Maximum number of non-padding offers committed by one Midnight offer tree.
 *
 * @example
 * ```ts
 * import { MAX_OFFERS_PER_TREE } from "@morpho-org/midnight-sdk";
 *
 * console.log(MAX_OFFERS_PER_TREE);
 * ```
 */
export const MAX_OFFERS_PER_TREE = 256;

const EMPTY_OFFER_STRUCT: OfferStruct = {
  market: {
    loanToken: ZERO_ADDRESS,
    collateralParams: [],
    maturity: 0n,
    rcfThreshold: 0n,
    enterGate: ZERO_ADDRESS,
    liquidatorGate: ZERO_ADDRESS,
  },
  buy: false,
  maker: ZERO_ADDRESS,
  start: 0n,
  expiry: 0n,
  tick: 0n,
  group: ZERO_BYTES32,
  callback: ZERO_ADDRESS,
  callbackData: "0x",
  receiverIfMakerIsSeller: ZERO_ADDRESS,
  ratifier: ZERO_ADDRESS,
  reduceOnly: false,
  maxUnits: 0n,
  maxAssets: 0n,
};

function isEmptyOfferStruct(offer: OfferStruct): boolean {
  return (
    offer.market.loanToken === ZERO_ADDRESS &&
    offer.market.collateralParams.length === 0 &&
    offer.market.maturity === 0n &&
    offer.market.rcfThreshold === 0n &&
    offer.market.enterGate === ZERO_ADDRESS &&
    offer.market.liquidatorGate === ZERO_ADDRESS &&
    offer.buy === false &&
    offer.maker === ZERO_ADDRESS &&
    offer.start === 0n &&
    offer.expiry === 0n &&
    offer.tick === 0n &&
    offer.group === ZERO_BYTES32 &&
    offer.callback === ZERO_ADDRESS &&
    offer.callbackData === "0x" &&
    offer.receiverIfMakerIsSeller === ZERO_ADDRESS &&
    offer.ratifier === ZERO_ADDRESS &&
    offer.reduceOnly === false &&
    offer.maxUnits === 0n &&
    offer.maxAssets === 0n
  );
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function padOfferStructs(offers: readonly OfferStruct[]): OfferStruct[] {
  if (isPowerOfTwo(offers.length)) return [...offers];
  const paddedLength = nextPowerOfTwo(offers.length);

  return [
    ...offers,
    ...Array.from(
      { length: paddedLength - offers.length },
      () => EMPTY_OFFER_STRUCT,
    ),
  ];
}

function assertLeafOffers(offers: readonly OfferStruct[]): void {
  const seen = new Set<Hash>();
  for (const offer of offers) {
    if (isEmptyOfferStruct(offer)) continue;

    const leafHash = OfferUtils.hashStruct(offer);
    if (seen.has(leafHash)) {
      throw new InvalidOfferTreeError(
        `Duplicate offer hash "${leafHash}" in offer tree.`,
      );
    }
    seen.add(leafHash);
  }

  if (seen.size === 0) {
    throw new InvalidOfferTreeError("Offer tree must not be empty.");
  }
}

/**
 * Offer tree descriptor.
 *
 * @example
 * ```ts
 * import type { OfferTreeDescriptor } from "@morpho-org/midnight-sdk";
 *
 * const tree = {} as OfferTreeDescriptor;
 * console.log(tree.root);
 * ```
 */
export interface OfferTreeDescriptor {
  /** Offer structs in leaf order, including trailing empty padding. */
  readonly offers: readonly OfferStruct[];
  /** Leaf hashes for the padded offer tree. */
  readonly leaves: readonly Hash[];
  /** Merkle root. */
  readonly root: Hash;
  /** Tree height. */
  readonly height: number;
}

/**
 * Merkle proof descriptor for one offer leaf.
 *
 * @example
 * ```ts
 * import type { OfferTreeProof } from "@morpho-org/midnight-sdk";
 *
 * const proof = {} as OfferTreeProof;
 * console.log(proof.leafIndex);
 * ```
 */
export interface OfferTreeProof {
  /** Merkle root. */
  readonly root: Hash;
  /** Leaf index in the offer tree. */
  readonly leafIndex: bigint;
  /** Sibling hashes from leaf to root. */
  readonly proof: readonly Hash[];
}

/**
 * Input accepted by {@link Tree.create}.
 *
 * @example
 * ```ts
 * import type { TreeCreateParams } from "@morpho-org/midnight-sdk";
 *
 * const params = [] as unknown as TreeCreateParams;
 * console.log(params.length);
 * ```
 */
export type TreeCreateParams = readonly (Group | Offer)[];

/**
 * Plain or class tree input accepted by higher-level helpers.
 *
 * @example
 * ```ts
 * import type { TreeInput } from "@morpho-org/midnight-sdk";
 *
 * const tree = {} as TreeInput;
 * console.log(tree);
 * ```
 */
export type TreeInput = Tree | TreeCreateParams;

/**
 * Parameters for {@link GroupUtils.validateForApiPublication}.
 *
 * @example
 * ```ts
 * import type { ValidateGroupForApiPublicationParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as ValidateGroupForApiPublicationParams;
 * console.log(params.group.id);
 * ```
 */
export interface ValidateGroupForApiPublicationParams {
  /** Group to validate before publishing through the public API. */
  readonly group: Group;
}

/**
 * Domain helpers for Midnight offer groups.
 *
 * @example
 * ```ts
 * import { GroupUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof GroupUtils.hash);
 * ```
 */
export namespace GroupUtils {
  /**
   * Derives the deterministic content-addressed id for a group of offers.
   *
   * This mirrors the router implementation: hash each offer with `group = 0`,
   * sort those hashes, concatenate them, then keccak the result.
   *
   * @param offers - Offers to hash as one group.
   * @returns Content-addressed group id.
   * @throws InvalidOfferGroupError when `offers` is empty.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const id = GroupUtils.hash([{} as never]);
   * console.log(id);
   * ```
   */
  export function hash(offers: readonly Offer[]): Hash {
    if (offers.length === 0) {
      throw new InvalidOfferGroupError(
        "Provide at least one offer in the group.",
      );
    }

    const offerHashes = offers.map((offer) => offer.groupHash);
    const sorted =
      offerHashes.length > 1 ? [...offerHashes].sort() : offerHashes;

    return keccak256(concat(sorted));
  }

  /**
   * Converts a group into ABI-compatible offers carrying the group id.
   *
   * @param group - Group to encode.
   * @returns ABI-compatible offers in caller order.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const structs = GroupUtils.toStructs({} as never);
   * console.log(structs.length);
   * ```
   */
  export function toStructs(group: Group): readonly OfferStruct[] {
    return group.offers.map((offer) =>
      OfferUtils.toStruct({ offer, group: group.id }),
    );
  }

  /**
   * Validates the public API publication rules known locally.
   *
   * This helper intentionally stays narrow: changing public policy should be
   * surfaced by `MidnightApi.validateMempoolTree` when possible.
   *
   * @param params - Group validation parameters.
   * @returns Immutable offers in the same order as the group.
   * @throws InvalidOfferGroupError when the group cannot be published through the public API.
   * @example
   * ```ts
   * import { GroupUtils } from "@morpho-org/midnight-sdk";
   *
   * const offers = GroupUtils.validateForApiPublication({ group: {} as never });
   * console.log(offers.length);
   * ```
   */
  export function validateForApiPublication(
    params: ValidateGroupForApiPublicationParams,
  ): readonly Offer[] {
    const offers = OfferUtils.validateOfferGroup({
      offers: params.group.offers,
    });
    const expectedGroup = comparableHex(hash(offers));
    const expectedCallback = comparableHex(offers[0]!.callback);
    const expectedCallbackData = comparableHex(offers[0]!.callbackData);

    if (comparableHex(params.group.id) !== expectedGroup) {
      throw new InvalidOfferGroupError(
        "API-published groups must use the content-addressed group id.",
      );
    }

    for (const offer of offers) {
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
}

/**
 * Protocol offer group with one shared consumption group id.
 *
 * @example
 * ```ts
 * import { Group } from "@morpho-org/midnight-sdk";
 *
 * const group = Group.create([{} as never]);
 * console.log(group.offers.length);
 * ```
 */
export class Group {
  /** Offers in this protocol group. */
  public readonly offers: readonly Offer[];

  private readonly _id: Hash;

  private constructor(id: Hash, offers: readonly Offer[]) {
    this._id = id;
    this.offers = [...offers];
  }

  /**
   * Content-addressed group id.
   *
   * @returns Group id derived from the group's offers.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.create([{} as never]);
   * console.log(group.id);
   * ```
   */
  public get id(): Hash {
    return this._id;
  }

  /**
   * Creates a protocol-valid offer group.
   *
   * @param offers - Offers to group.
   * @returns Group instance.
   * @throws InvalidOfferGroupError when group mechanics are invalid.
   * @example
   * ```ts
   * import { Group } from "@morpho-org/midnight-sdk";
   *
   * const group = Group.create([{} as never]);
   * console.log(group.offers.length);
   * ```
   */
  public static create(offers: readonly Offer[]): Group {
    const validatedOffers = OfferUtils.validateOfferGroup({ offers });

    return new Group(GroupUtils.hash(validatedOffers), validatedOffers);
  }
}

/**
 * Offer Merkle tree used by Midnight ratifiers.
 *
 * @example
 * ```ts
 * import { Offer, Tree } from "@morpho-org/midnight-sdk";
 *
 * const tree = Tree.create([Offer.create({} as never)]);
 * console.log(tree.root);
 * ```
 */
export class Tree {
  /** Groups committed to the tree. */
  public readonly groups: readonly Group[];

  /** Non-padding offers in leaf order. */
  public readonly offers: readonly Offer[];

  /** ABI-compatible offers in leaf order, including protocol-zero padding. */
  public readonly paddedOffers: readonly OfferStruct[];

  /** Leaf hashes for `paddedOffers`. */
  public readonly leaves: readonly Hash[];

  /** Merkle root. */
  public readonly root: Hash;

  /** Tree height. */
  public readonly height: number;

  private constructor(groups: readonly Group[]) {
    this.groups = [...groups];
    this.offers = groups.flatMap((group) => group.offers);

    const descriptor = OfferTreeUtils.buildOfferTreeDescriptor(this.groups);
    this.paddedOffers = descriptor.offers;
    this.leaves = descriptor.leaves;
    this.root = descriptor.root;
    this.height = descriptor.height;
  }

  /**
   * Creates an offer tree from groups or standalone offers.
   *
   * @param params - Tree creation parameters.
   * @returns Tree instance.
   * @throws InvalidOfferTreeError when the tree is empty, all padding, or duplicated.
   * @throws InvalidOfferTreeHeightError when the resulting height is unsupported.
   * @example
   * ```ts
   * import { Offer, Tree } from "@morpho-org/midnight-sdk";
   *
   * const tree = Tree.create([Offer.create({} as never)]);
   * console.log(tree.height);
   * ```
   */
  public static create(params: TreeCreateParams): Tree {
    return new Tree(
      params.map((entry) => OfferTreeUtils.normalizeGroup(entry)),
    );
  }

  /**
   * Builds a Merkle proof for one leaf.
   *
   * @param leafIndex - Leaf index to prove.
   * @returns Offer tree proof.
   * @throws InvalidOfferTreeError when the leaf index is out of range.
   * @example
   * ```ts
   * import { Tree } from "@morpho-org/midnight-sdk";
   *
   * const proof = Tree.create([{} as never]).proof(0n);
   * console.log(proof.root);
   * ```
   */
  public proof(leafIndex: BigIntish): OfferTreeProof {
    return OfferTreeUtils.buildOfferTreeProof({
      entries: this.groups,
      leafIndex,
    });
  }
}

/**
 * Utilities for Midnight offer trees.
 *
 * @example
 * ```ts
 * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof OfferTreeUtils.hashNode);
 * ```
 */
export namespace OfferTreeUtils {
  /**
   * Returns a group instance from class or plain input.
   *
   * @param entry - Group class or standalone offer.
   * @returns Group instance.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const group = OfferTreeUtils.normalizeGroup({} as never);
   * console.log(group.offers.length);
   * ```
   */
  export function normalizeGroup(entry: Group | Offer): Group {
    return entry instanceof Group ? entry : Group.create([entry]);
  }

  /**
   * Returns a tree instance from class or plain input.
   *
   * @param tree - Tree class or creation input.
   * @returns Tree instance.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const tree = OfferTreeUtils.normalizeTree([{} as never]);
   * console.log(tree.root);
   * ```
   */
  export function normalizeTree(tree: TreeInput): Tree {
    return tree instanceof Tree ? tree : Tree.create(tree);
  }

  /**
   * Computes HashLib node hash from left and right child hashes.
   *
   * @param left - Left child hash.
   * @param right - Right child hash.
   * @returns Node hash.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = OfferTreeUtils.hashNode(
   *   "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   "0x0000000000000000000000000000000000000000000000000000000000000000",
   * );
   * console.log(root);
   * ```
   */
  export function hashNode(left: Hash, right: Hash) {
    return keccak256(concat([left, right]));
  }

  /**
   * Builds an offer tree and Merkle root. Non-power-of-two batches are
   * padded with protocol-zero offers at the highest leaf indices.
   *
   * @param entries - Groups or standalone offers in leaf order.
   * @returns Offer tree descriptor.
   * @throws InvalidOfferTreeError when the offer count is empty, all padding, or duplicated.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const tree = OfferTreeUtils.buildOfferTreeDescriptor([{} as never]);
   * console.log(tree.root);
   * ```
   */
  export function buildOfferTreeDescriptor(
    entries: TreeCreateParams,
  ): OfferTreeDescriptor {
    const groups = entries.map((entry) => normalizeGroup(entry));
    const offers = groups.flatMap((group) => group.offers);
    if (offers.length === 0) {
      throw new InvalidOfferTreeError("Offer tree must not be empty.");
    }
    if (offers.length > MAX_OFFERS_PER_TREE) {
      throw new InvalidOfferTreeError(
        `Offer tree exceeds ${MAX_OFFERS_PER_TREE} offers.`,
      );
    }

    const offerStructs = padOfferStructs(groups.flatMap(GroupUtils.toStructs));
    assertLeafOffers(offerStructs);

    const height = Math.log2(offerStructs.length);
    if (height > 20) throw new InvalidOfferTreeHeightError(height);

    let level = offerStructs.map(OfferUtils.hashStruct);
    const leaves = [...level];

    while (level.length > 1) {
      const next: Hash[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hashNode(level[i]!, level[i + 1]!));
      }
      level = next;
    }

    return deepFreeze({
      offers: offerStructs,
      leaves,
      root: level[0]!,
      height,
    });
  }

  /**
   * Builds only the offer-tree root.
   *
   * @param entries - Groups or standalone offers in leaf order.
   * @returns Merkle root.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = OfferTreeUtils.buildOfferTreeRoot([{} as never]);
   * console.log(root);
   * ```
   */
  export function buildOfferTreeRoot(entries: TreeCreateParams) {
    return buildOfferTreeDescriptor(entries).root;
  }

  /**
   * Builds a Merkle proof for one offer.
   *
   * @param params - Proof parameters.
   * @returns Proof descriptor.
   * @throws InvalidOfferTreeError when leaf index is out of range.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const proof = OfferTreeUtils.buildOfferTreeProof({ entries: [{} as never], leafIndex: 0n });
   * console.log(proof.proof.length);
   * ```
   */
  export function buildOfferTreeProof(params: {
    readonly entries: TreeCreateParams;
    readonly leafIndex: BigIntish;
  }): OfferTreeProof {
    const payload = buildOfferTreeDescriptor(params.entries);
    const leafIndex = BigInt(params.leafIndex);
    if (leafIndex < 0n || leafIndex >= BigInt(payload.offers.length)) {
      throw new InvalidOfferTreeError(
        `Leaf index "${leafIndex}" is outside the offer tree.`,
      );
    }

    let index = Number(leafIndex);
    let level = [...payload.leaves];
    const proof: Hash[] = [];
    while (level.length > 1) {
      proof.push(level[index ^ 1]!);
      const next: Hash[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(hashNode(level[i]!, level[i + 1]!));
      }
      index = Math.floor(index / 2);
      level = next;
    }

    return deepFreeze({ root: payload.root, leafIndex, proof });
  }

  /**
   * Verifies a local offer Merkle proof against a root.
   *
   * @param params - Offer proof verification parameters.
   * @returns Whether the proof reconstructs the supplied root.
   * @example
   * ```ts
   * import { OfferTreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const valid = OfferTreeUtils.verifyOfferTreeProof({} as never);
   * console.log(valid);
   * ```
   */
  export function verifyOfferTreeProof(params: {
    readonly offer: Offer;
    readonly group: Hash;
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    let node = params.offer.hash(params.group);
    const leafIndex = BigInt(params.leafIndex);
    if (leafIndex < 0n || leafIndex >> BigInt(params.proof.length) !== 0n) {
      return false;
    }
    let remainingLeafIndex = leafIndex;

    for (const sibling of params.proof) {
      node =
        (remainingLeafIndex & 1n) === 0n
          ? hashNode(node, sibling)
          : hashNode(sibling, node);
      remainingLeafIndex >>= 1n;
    }

    return node === params.root;
  }
}

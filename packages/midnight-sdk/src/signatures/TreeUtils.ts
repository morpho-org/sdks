import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import { concat, type Hash, keccak256 } from "viem";
import { InvalidTreeError, InvalidTreeHeightError } from "../errors.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import type { GroupInput } from "./GroupUtils.js";
import type { Tree } from "./Tree.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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

const EMPTY_OFFER_DEFAULT_GROUP = OfferUtils.hashStruct(EMPTY_OFFER_STRUCT);

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
    (offer.group === ZERO_BYTES32 ||
      offer.group === EMPTY_OFFER_DEFAULT_GROUP) &&
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
      throw new InvalidTreeError(`Duplicate offer hash "${leafHash}" in tree.`);
    }
    seen.add(leafHash);
  }

  if (seen.size === 0) {
    throw new InvalidTreeError("Tree must not be empty.");
  }
}

/**
 * Fully materialized tree descriptor.
 *
 * Use this shape when a caller needs leaf structs, leaf hashes, root, and
 * height without keeping a `Tree` instance, for example before custom signing
 * or proof generation.
 *
 * @example
 * ```ts
 * import { Offer, TreeUtils, type TreeDescriptor } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
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
 * const tree: TreeDescriptor = TreeUtils.buildDescriptor([offer]);
 * console.log(tree.root);
 * ```
 */
export interface TreeDescriptor {
  /** Offer structs in leaf order, including trailing empty padding. */
  readonly offers: readonly OfferStruct[];
  /** Leaf hashes for the padded tree. */
  readonly leaves: readonly Hash[];
  /** Merkle root. */
  readonly root: Hash;
  /** Tree height. */
  readonly height: number;
}

/**
 * Merkle proof descriptor for one tree leaf.
 *
 * Ratifier data embeds this information so a taker can prove the offer belongs
 * to the maker-approved or maker-signed root.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type TreeProof } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
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
 * const proof: TreeProof = Tree.create([offer]).proof(0n);
 * console.log(proof.leafIndex);
 * ```
 */
export interface TreeProof {
  /** Merkle root. */
  readonly root: Hash;
  /** Leaf index in the tree. */
  readonly leafIndex: bigint;
  /** Sibling hashes from leaf to root. */
  readonly proof: readonly Hash[];
}

/**
 * Entries accepted by {@link Tree.create}.
 *
 * Entries are either explicit groups or standalone offers. Explicit groups are
 * flattened, and standalone offers are hashed with their own group ids.
 *
 * @example
 * ```ts
 * import { Tree, type TreeCreateParams } from "@morpho-org/midnight-sdk";
 * import { Offer } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
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
 * const params = [offer] satisfies TreeCreateParams;
 * const tree = Tree.create(params);
 * console.log(tree.root);
 * ```
 */
export type TreeCreateParams = readonly GroupInput[];

/**
 * Plain creation input or class tree accepted by {@link Tree.from}.
 *
 * Use this only at boundaries that intentionally convert caller input into a
 * `Tree`. Utilities that already need a full tree, such as proof and ratifier
 * helpers, accept `Tree` directly to avoid rebuilding.
 *
 * @example
 * ```ts
 * import { Offer, type TreeInput } from "@morpho-org/midnight-sdk";
 * import { zeroAddress } from "viem";
 *
 * const offer = Offer.create({
 *   market: {
 *     loanToken: "0x0000000000000000000000000000000000006000",
 *     collateralParams: [],
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
 * const tree: TreeInput = [offer];
 * console.log(tree);
 * ```
 */
export type TreeInput = Tree | TreeCreateParams;

/**
 * Object-compatible tree hashing, root, proof, and verification helpers.
 *
 * Use these when you need pure tree hashing, descriptor construction, or proof
 * verification. In the normal make-side flow, `Tree.create` wraps descriptor
 * construction; proof helpers accept the built `Tree` so cached leaves/root are
 * reused.
 *
 * @example
 * ```ts
 * import { TreeUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof TreeUtils.buildRoot);
 * ```
 */
export namespace TreeUtils {
  /**
   * Computes HashLib node hash from left and right child hashes.
   *
   * @param left - Left child hash.
   * @param right - Right child hash.
   * @returns Node hash.
   * @example
   * ```ts
   * import { TreeUtils } from "@morpho-org/midnight-sdk";
   *
   * const root = TreeUtils.hashNode(
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
   * Builds a tree descriptor and Merkle root. Non-power-of-two batches are
   * padded with protocol-zero offers at the highest leaf indices.
   *
   * Use after `Group.create` or standalone `Offer.create` when you need the
   * padded leaves for custom signing, root approval, or proof construction.
   * Groups are flattened, and each offer is encoded with its own group id.
   * `Tree.create` calls this internally and is the simpler API for most
   * make-side code.
   *
   * @param entries - Groups or standalone offers in leaf order.
   * @returns Tree descriptor.
   * @throws {InvalidTreeError} when the offer count is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the padded tree exceeds supported ratifier typehashes.
   * @example
   * ```ts
   * import { Offer, TreeUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
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
   * const tree = TreeUtils.buildDescriptor([offer]);
   * console.log(tree.root);
   * ```
   */
  export function buildDescriptor(entries: TreeCreateParams): TreeDescriptor {
    const offers = entries.flatMap((entry) =>
      "offers" in entry ? entry.offers : [entry],
    );
    if (offers.length === 0) {
      throw new InvalidTreeError("Tree must not be empty.");
    }

    const offerStructs = padOfferStructs(
      offers.map((offer) => OfferUtils.toStruct({ offer })),
    );
    assertLeafOffers(offerStructs);

    const height = Math.log2(offerStructs.length);
    if (height > 20) throw new InvalidTreeHeightError(height);

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
   * Builds only the tree root.
   *
   * Use when only the root is needed, for example to compare a locally built
   * tree with an approved root. Use `Tree.create` or `buildDescriptor` if later
   * proof generation is required.
   *
   * @param entries - Groups or standalone offers in leaf order.
   * @returns Merkle root.
   * @throws {InvalidTreeError} when the offer count is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the padded tree exceeds supported ratifier typehashes.
   * @example
   * ```ts
   * import { Offer, TreeUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
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
   * const root = TreeUtils.buildRoot([offer]);
   * console.log(root);
   * ```
   */
  export function buildRoot(entries: TreeCreateParams) {
    return buildDescriptor(entries).root;
  }

  /**
   * Builds a Merkle proof for one offer.
   *
   * Use after tree construction when a custom ratifier needs one proof. The
   * built-in Ecrecover and Setter helpers call this while generating
   * `ratifierData`.
   *
   * @param params - Proof parameters.
   * @returns Proof descriptor.
   * @throws {InvalidTreeError} when leaf index is out of range.
   * @example
   * ```ts
   * import { Offer, Tree, TreeUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
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
   * const proof = TreeUtils.buildProof({
   *   tree: Tree.create([offer]),
   *   leafIndex: 0n,
   * });
   * console.log(proof.proof.length);
   * ```
   */
  export function buildProof(params: {
    readonly tree: Tree;
    readonly leafIndex: BigIntish;
  }): TreeProof {
    const leafIndex = BigInt(params.leafIndex);
    if (
      leafIndex < 0n ||
      leafIndex >= BigInt(params.tree.paddedOffers.length)
    ) {
      throw new InvalidTreeError(
        `Leaf index "${leafIndex}" is outside the tree.`,
      );
    }

    let index = Number(leafIndex);
    let level = [...params.tree.leaves];
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

    return deepFreeze({ root: params.tree.root, leafIndex, proof });
  }

  /**
   * Verifies a local Merkle proof against a root.
   *
   * Use on the take-side or in tests to inspect decoded payload or ratifier
   * data before forwarding it to a transaction builder. Onchain ratifiers still
   * perform the authoritative verification.
   *
   * @param params - Proof verification parameters.
   * @returns Whether the proof reconstructs the supplied root.
   * @example
   * ```ts
   * import { Offer, Tree, TreeUtils } from "@morpho-org/midnight-sdk";
   * import { zeroAddress } from "viem";
   *
   * const offer = Offer.create({
   *   market: {
   *     loanToken: "0x0000000000000000000000000000000000006000",
   *     collateralParams: [],
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
   * const tree = Tree.create([offer]);
   * const proof = tree.proof(0n);
   * const valid = TreeUtils.verifyProof({
   *   offer: tree.offers[0]!,
   *   root: proof.root,
   *   leafIndex: proof.leafIndex,
   *   proof: proof.proof,
   * });
   * console.log(valid);
   * ```
   */
  export function verifyProof(params: {
    readonly offer: IOffer;
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    const offer = Offer.from(params.offer);
    let node = OfferUtils.hash(offer);
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

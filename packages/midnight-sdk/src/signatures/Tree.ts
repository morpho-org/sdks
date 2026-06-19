import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Hash } from "viem";
import { Offer, type OfferStruct } from "../offers/index.js";
import { Group } from "./Group.js";
import {
  type TreeCreateParams,
  type TreeInput,
  type TreeProof,
  TreeUtils,
} from "./TreeUtils.js";

export type {
  TreeCreateParams,
  TreeDescriptor,
  TreeInput,
  TreeProof,
} from "./TreeUtils.js";

/**
 * Maker-side Merkle tree used by Midnight ratifiers.
 *
 * Build a tree after offers have been created and related offers have been
 * grouped. The tree root is what Ecrecover makers sign, Setter makers approve,
 * and payload items later prove with per-leaf ratifier data.
 *
 * @example
 * ```ts
 * import { Offer, Tree } from "@morpho-org/midnight-sdk";
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
 * console.log(tree.root);
 * ```
 */
export class Tree {
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

  private constructor(params: TreeCreateParams) {
    this.offers = params.flatMap((entry) =>
      "offers" in entry ? Group.from(entry).offers : [Offer.from(entry)],
    );

    const descriptor = TreeUtils.buildDescriptor(this.offers);
    this.paddedOffers = descriptor.offers;
    this.leaves = descriptor.leaves;
    this.root = descriptor.root;
    this.height = descriptor.height;
  }

  /**
   * Returns a tree instance from class or plain input.
   *
   * Use at boundaries that accept either a prebuilt tree or raw group/offer
   * inputs, such as API validation helpers. Existing `Tree` instances are
   * returned as-is.
   *
   * @param tree - Tree class or creation input.
   * @returns Tree instance.
   * @throws {InvalidTreeError} when the tree is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the resulting height is unsupported.
   * @example
   * ```ts
   * import { Offer, Tree } from "@morpho-org/midnight-sdk";
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
   * const tree = Tree.from([offer]);
   * console.log(tree.root);
   * ```
   */
  public static from(tree: TreeInput): Tree {
    return tree instanceof Tree ? tree : Tree.create(tree);
  }

  /**
   * Creates a tree from groups or standalone offers.
   *
   * Use after `Offer.create` and optional `Group.create`, before
   * `MidnightApi.validateMempoolTree`, `EcrecoverRatifierUtils.ratify`, or
   * `SetterRatifierUtils.ratify`. Groups are flattened; the tree hashes each
   * offer with the group id already stored on the offer.
   *
   * @param params - Groups or standalone offers in leaf order.
   * @returns Tree instance.
   * @throws {InvalidTreeError} when the tree is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the resulting height is unsupported.
   * @example
   * ```ts
   * import { Offer, Tree } from "@morpho-org/midnight-sdk";
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
   * console.log(tree.height);
   * ```
   */
  public static create(params: TreeCreateParams): Tree {
    return new Tree(params);
  }

  /**
   * Builds a Merkle proof for one leaf.
   *
   * Ratifier utilities call this when building per-offer `ratifierData`. Use it
   * directly only for custom ratifiers or local proof inspection.
   *
   * @param leafIndex - Leaf index to prove.
   * @returns Tree proof.
   * @throws {InvalidTreeError} when the leaf index is out of range.
   * @example
   * ```ts
   * import { Offer, Tree } from "@morpho-org/midnight-sdk";
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
   * const proof = Tree.create([offer]).proof(0n);
   * console.log(proof.root);
   * ```
   */
  public proof(leafIndex: BigIntish): TreeProof {
    return TreeUtils.buildProof({
      tree: this,
      leafIndex,
    });
  }
}

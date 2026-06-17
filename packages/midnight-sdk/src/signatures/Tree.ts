import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Hash } from "viem";
import type { IOffer, OfferStruct } from "../offers/index.js";
import { GroupUtils, type IGroup } from "./GroupUtils.js";
import {
  type TreeCreateParams,
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
 *
 * const tree = Tree.create(Offer.create({} as never));
 * console.log(tree.root);
 * ```
 */
export class Tree {
  /** Groups committed to the tree. */
  public readonly groups: readonly IGroup[];

  /** Non-padding offers in leaf order. */
  public readonly offers: readonly IOffer[];

  /** ABI-compatible offers in leaf order, including protocol-zero padding. */
  public readonly paddedOffers: readonly OfferStruct[];

  /** Leaf hashes for `paddedOffers`. */
  public readonly leaves: readonly Hash[];

  /** Merkle root. */
  public readonly root: Hash;

  /** Tree height. */
  public readonly height: number;

  private constructor(groups: readonly IGroup[]) {
    this.groups = [...groups];
    this.offers = groups.flatMap((group) => group.offers);

    const descriptor = TreeUtils.buildDescriptor(this.groups);
    this.paddedOffers = descriptor.offers;
    this.leaves = descriptor.leaves;
    this.root = descriptor.root;
    this.height = descriptor.height;
  }

  /**
   * Creates a tree from groups or standalone offers.
   *
   * Use after `Offer.create` and optional `Group.create`, before
   * `MidnightApi.validateMempoolTree`, `EcrecoverRatifierUtils.ratify`, or
   * `SetterRatifierUtils.ratify`.
   *
   * @param params - Groups or standalone offers in leaf order.
   * @returns Tree instance.
   * @throws {InvalidTreeError} when the tree is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the resulting height is unsupported.
   * @example
   * ```ts
   * import { Offer, Tree } from "@morpho-org/midnight-sdk";
   *
   * const tree = Tree.create(Offer.create({} as never));
   * console.log(tree.height);
   * ```
   */
  public static create(...params: TreeCreateParams): Tree {
    return new Tree(params.map((entry) => GroupUtils.normalize(entry)));
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
   * import { Tree } from "@morpho-org/midnight-sdk";
   *
   * const proof = Tree.create({} as never).proof(0n);
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

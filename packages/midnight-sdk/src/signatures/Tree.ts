import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Hash } from "viem";
import type { MempoolPayloadValidationResult } from "../api/types.js";
import { Offer, type OfferStruct } from "../offers/index.js";
import { Group } from "./Group.js";
import {
  type TreeCreateParams,
  type TreeInput,
  type TreeMempoolValidateParams,
  type TreeProof,
  TreeUtils,
} from "./TreeUtils.js";

export type {
  TreeCreateParams,
  TreeDescriptor,
  TreeInput,
  TreeMempoolValidateParams,
  TreeProof,
  TreeUtilsMempoolValidateParams,
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
   * `Tree.mempoolValidate`, `EcrecoverRatifierUtils.ratify`, or
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
   * Validates this tree against Midnight mempool API policy.
   *
   * This is an API-backed convenience: it encodes each tree leaf with empty
   * `ratifierData`, then sends the temporary payload to the Midnight API
   * `POST /mempool/validate` endpoint. API policy only inspects offer contents,
   * so use this before wallet signature or Setter root approval.
   *
   * @param params.chainId - Chain id whose API policy should validate this tree.
   * @param params.apiUrl - Optional Midnight API URL override used for the validation HTTP request.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @param params.fetch - Optional fetch implementation override used for the API call.
   * @param params.request - Optional fetch options forwarded to the API request.
   * @returns Successful API validation result.
   * @throws {Payload.DecodeError} when validation payload encoding fails.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API returns malformed success JSON.
   * @throws {MidnightMempoolValidationError} when the API returns validation issues.
   * @example
   * ```ts
   * import { Offer, Tree } from "@morpho-org/midnight-sdk";
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
   *   ratifier: "0x0000000000000000000000000000000000004000",
   *   maxUnits: 100n,
   * });
   * await Tree.create([offer]).mempoolValidate({
   *   chainId: 8453,
   * });
   * ```
   */
  public mempoolValidate(
    params: TreeMempoolValidateParams,
  ): Promise<MempoolPayloadValidationResult> {
    return TreeUtils.mempoolValidate({
      ...params,
      tree: this,
    });
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

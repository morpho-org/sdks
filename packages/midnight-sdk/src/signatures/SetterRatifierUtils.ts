import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hash,
  type Hex,
} from "viem";
import type { Item as PayloadItem } from "./Payload.js";
import type { RatifierTreeInput, TreeProof } from "./TreeUtils.js";
import {
  buildTreeProof,
  getRatifierTreeRatifier,
  normalizeRatifierTreeInput,
} from "./treeInternal.js";

const setterRatifierDataAbi = [
  { name: "root", type: "bytes32" },
  { name: "leafIndex", type: "uint256" },
  { name: "proof", type: "bytes32[]" },
] as const;

/**
 * Decoded SetterRatifier ratifier data.
 *
 * Use this on the take-side or in diagnostics after `Payload.decode` when you
 * need to inspect the proof attached to a Setter-ratified offer.
 *
 * @example
 * ```ts
 * import { SetterRatifierUtils, type DecodedSetterRatifierData } from "@morpho-org/midnight-sdk";
 * import { zeroHash } from "viem";
 *
 * const data = SetterRatifierUtils.encodeRatifierData({
 *   root: zeroHash,
 *   leafIndex: 0n,
 *   proof: [],
 * });
 * const decoded: DecodedSetterRatifierData =
 *   SetterRatifierUtils.decodeRatifierData(data);
 * console.log(decoded.root);
 * ```
 */
export type DecodedSetterRatifierData = TreeProof;

/**
 * Parameters for one SetterRatifier ratifier-data value.
 *
 * Use after the offer maker or delegate has approved the tree root onchain.
 * Setter approvals are keyed by maker and root, so a mixed-maker tree needs one
 * approval per maker for the same root.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type SetterRatifierDataParams } from "@morpho-org/midnight-sdk";
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
 *   ratifier: "0x0000000000000000000000000000000000005000",
 *   maxUnits: 100n,
 * });
 * const params: SetterRatifierDataParams = {
 *   tree: Tree.create([offer]),
 *   leafIndex: 0n,
 * };
 * console.log(params.leafIndex);
 * ```
 */
export interface SetterRatifierDataParams {
  /** Tree-like input that produced the proof. Existing `Tree` instances reuse cached hashes and proofs. */
  readonly tree: RatifierTreeInput;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
}

/**
 * SetterRatifier-specific pure utilities.
 *
 * Use this route for deployed-code makers. The make-side sequence is: create
 * offers with the Setter ratifier address, build the group/tree, validate the
 * tree, approve the root onchain for every maker in the tree, call `ratify`,
 * then pass the returned items to `Payload.encode`.
 * Ratifier helpers accept tree-like inputs rather than requiring the `Tree`
 * class. Passing an existing `Tree` remains the optimal path because its
 * cached offers, leaves, root, and height are reused when proofs are encoded.
 *
 * @example
 * ```ts
 * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(typeof SetterRatifierUtils.encodeRatifierData);
 * ```
 */
export namespace SetterRatifierUtils {
  /**
   * Encodes SetterRatifier ratifier data.
   *
   * Use only when you already have a root and proof. Most maker flows call
   * `ratifierData` for one leaf or `ratify` for every leaf in the approved
   * tree.
   *
   * @param params.root - Merkle root approved by the maker's Setter ratifier.
   * @param params.leafIndex - Leaf index proven by `params.proof`.
   * @param params.proof - Merkle proof siblings for the leaf.
   * @returns ABI-encoded ratifier data.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const data = SetterRatifierUtils.encodeRatifierData({
   *   root: "0x0000000000000000000000000000000000000000000000000000000000000000",
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * console.log(data);
   * ```
   */
  export function encodeRatifierData(params: {
    readonly root: Hash;
    readonly leafIndex: BigIntish;
    readonly proof: readonly Hash[];
  }) {
    return encodeAbiParameters(setterRatifierDataAbi, [
      params.root,
      BigInt(params.leafIndex),
      params.proof,
    ]);
  }

  /**
   * Decodes SetterRatifier ratifier data.
   *
   * Use on the take-side or in tests after `Payload.decode` to inspect the
   * proof attached to a published Setter offer.
   *
   * @param data - ABI-encoded ratifier data.
   * @returns Decoded Setter ratifier data.
   * @example
   * ```ts
   * import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
   * import { zeroHash } from "viem";
   *
   * const data = SetterRatifierUtils.encodeRatifierData({
   *   root: zeroHash,
   *   leafIndex: 0n,
   *   proof: [],
   * });
   * const decoded = SetterRatifierUtils.decodeRatifierData(data);
   * console.log(decoded.proof);
   * ```
   */
  export function decodeRatifierData(data: Hex): DecodedSetterRatifierData {
    const [root, leafIndex, proof] = decodeAbiParameters(
      setterRatifierDataAbi,
      data,
    );

    return deepFreeze({ root, leafIndex, proof: [...proof] });
  }

  /**
   * Builds one ratifier-data value for a tree leaf.
   *
   * Use after root approval when a caller needs data for one offer leaf. Use
   * `ratify` to produce payload-ready items for the whole tree. Setter
   * approvals are keyed by maker and root, so the maker for this leaf must have
   * approved the tree root onchain.
   *
   * @param params.tree - Setter-ratified offer tree-like input that produced the proof.
   * @param params.leafIndex - Leaf index to prove.
   * @returns ABI-encoded SetterRatifier data.
   * @throws {InvalidTreeError} when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { Offer, SetterRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
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
   *   ratifier: "0x0000000000000000000000000000000000005000",
   *   maxUnits: 100n,
   * });
   * const data = SetterRatifierUtils.ratifierData({
   *   tree: Tree.create([offer]),
   *   leafIndex: 0n,
   * });
   * console.log(data);
   * ```
   */
  export function ratifierData(params: SetterRatifierDataParams): Hex {
    const tree = normalizeRatifierTreeInput(params.tree);
    const proof = buildTreeProof({ tree, leafIndex: params.leafIndex });

    return encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Returns payload-ready items after a Setter root has been approved.
   *
   * Use after `Tree.mempoolValidate` and the root approval
   * transaction has been submitted for every maker in the tree. Setter
   * approvals are keyed by maker and root, so mixed-maker trees need one
   * approval per maker for the same root. The returned items can be passed
   * directly to `Payload.encode`. All offers in the tree must use one ratifier
   * address; build separate trees per ratifier.
   *
   * @param params.tree - Setter-ratified offer tree-like input whose root has already been approved onchain.
   * @returns Items containing each offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid or contains multiple ratifiers.
   * @example
   * ```ts
   * import { SetterRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
   * import { Offer } from "@morpho-org/midnight-sdk";
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
   *   ratifier: "0x0000000000000000000000000000000000005000",
   *   maxUnits: 100n,
   * });
   *
   * const items = SetterRatifierUtils.ratify({
   *   tree: Tree.create([offer]),
   * });
   * console.log(items.length);
   * ```
   */
  export function ratify(params: {
    readonly tree: RatifierTreeInput;
  }): readonly PayloadItem[] {
    const tree = normalizeRatifierTreeInput(params.tree);
    getRatifierTreeRatifier({ tree, label: "Setter" });

    const items: PayloadItem[] = [];

    for (const offer of tree.offers) {
      items.push({
        offer,
        ratifierData: ratifierData({
          tree,
          leafIndex: items.length,
        }),
      });
    }

    return items;
  }
}

import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hash,
  type Hex,
} from "viem";
import type { Item as PayloadItem } from "./Payload.js";
import type { Tree } from "./Tree.js";
import type { TreeProof } from "./TreeUtils.js";

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
 * Use after the maker or delegate has approved the tree root onchain.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type SetterRatifierDataParams } from "@morpho-org/midnight-sdk";
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
  /** Tree that produced the proof. */
  readonly tree: Tree;
  /** Leaf index to prove. */
  readonly leafIndex: BigIntish;
}

/**
 * SetterRatifier-specific pure utilities.
 *
 * Use this route for deployed-code makers. The make-side sequence is: create
 * offers with the Setter ratifier address, build the group/tree, validate the
 * tree, approve the root onchain, call `ratify`, then pass the returned items
 * to `Payload.encode`.
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
   * @param params - Ratifier-data parameters.
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
   * `ratify` to produce payload-ready items for the whole tree.
   *
   * @param params - Ratifier-data parameters.
   * @returns ABI-encoded SetterRatifier data.
   * @throws {InvalidTreeError} when the leaf index is outside the tree.
   * @example
   * ```ts
   * import { Offer, SetterRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
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
    const proof = params.tree.proof(params.leafIndex);

    return encodeRatifierData({
      root: proof.root,
      leafIndex: proof.leafIndex,
      proof: proof.proof,
    });
  }

  /**
   * Returns payload-ready items after a Setter root has been approved.
   *
   * Use after `MidnightApi.validateMempoolTree` and the root approval
   * transaction has been submitted. The returned items can be passed directly
   * to `Payload.encode`.
   *
   * @param params - Tree to ratify.
   * @returns Items containing each offer and its ratifier data.
   * @throws {InvalidTreeError} when the tree is invalid.
   * @example
   * ```ts
   * import { SetterRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
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
    readonly tree: Tree;
  }): readonly PayloadItem[] {
    const items: PayloadItem[] = [];

    for (const offer of params.tree.offers) {
      items.push({
        offer,
        ratifierData: ratifierData({
          tree: params.tree,
          leafIndex: items.length,
        }),
      });
    }

    return items;
  }
}

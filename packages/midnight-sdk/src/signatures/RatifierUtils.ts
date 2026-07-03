import type { Address, Hex } from "viem";
import { InvalidTreeError } from "../errors.js";
import { type IOffer, Offer } from "../offers/index.js";
import { Group } from "./Group.js";
import type { RatifierTreeInput, TreeLike } from "./TreeUtils.js";
import { TreeUtils } from "./TreeUtils.js";

function isTreeLike(tree: RatifierTreeInput): tree is TreeLike {
  return (
    !Array.isArray(tree) &&
    "offers" in tree &&
    "paddedOffers" in tree &&
    "leaves" in tree &&
    "root" in tree &&
    "height" in tree
  );
}

function normalizeTree(tree: RatifierTreeInput): TreeLike {
  if (isTreeLike(tree)) return tree;

  const offers: readonly IOffer[] = tree.flatMap((entry) =>
    "offers" in entry ? Group.from(entry).offers : [Offer.from(entry)],
  );
  const descriptor = TreeUtils.buildDescriptor(offers);

  return {
    offers,
    paddedOffers: descriptor.offers,
    leaves: descriptor.leaves,
    root: descriptor.root,
    height: descriptor.height,
  };
}

function assertRatifierTree(params: {
  readonly tree: Pick<TreeLike, "offers">;
  readonly label: "Ecrecover" | "Setter";
}): Address {
  const firstOffer = params.tree.offers[0];
  if (firstOffer == null) {
    throw new InvalidTreeError("Tree must contain at least one offer.");
  }

  const ratifier = firstOffer.ratifier;
  const comparableRatifier = ratifier.toLowerCase();
  for (const offer of params.tree.offers.slice(1)) {
    if (offer.ratifier.toLowerCase() !== comparableRatifier) {
      throw new InvalidTreeError(
        `All offers in a ${params.label} tree must use one ratifier; expected "${ratifier}", got "${offer.ratifier}". Build separate trees per ratifier.`,
      );
    }
  }

  return ratifier;
}

/**
 * Parameters for {@link RatifierUtils.getRatifierInfo}.
 *
 * Pass the maker account bytecode read at the same block context used to build
 * the offer. The bytecode is used only to choose the ratifier address to put on
 * the offer.
 *
 * @example
 * ```ts
 * import type { GetRatifierInfoParams } from "@morpho-org/midnight-sdk";
 *
 * const params: GetRatifierInfoParams = {
 *   bytecode: "0x",
 *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
 *   setterRatifier: "0x0000000000000000000000000000000000000002",
 * };
 * console.log(params.bytecode);
 * ```
 */
export interface GetRatifierInfoParams {
  /** Maker account bytecode returned by viem `getBytecode`; `undefined`, `null`, and `0x` mean no deployed code. */
  readonly bytecode?: Hex | null;
  /** Ecrecover ratifier address. */
  readonly ecrecoverRatifier: Address;
  /** Setter ratifier address. */
  readonly setterRatifier: Address;
}

/**
 * Classification of the ratifier route for a maker account.
 *
 * Put `ratifier` on each new `Offer.create` call for this maker. Use `type` to
 * decide whether the tree later needs an Ecrecover signature or a Setter root
 * approval before payload encoding.
 *
 * @example
 * ```ts
 * import type { RatifierInfo } from "@morpho-org/midnight-sdk";
 *
 * const info: RatifierInfo = {
 *   type: "ecrecover",
 *   ratifier: "0x0000000000000000000000000000000000000001",
 * };
 * ```
 */
export interface RatifierInfo {
  /** Ratifier family selected for the maker account. */
  readonly type: "ecrecover" | "setter";
  /** Ratifier contract address to put on the offer. */
  readonly ratifier: Address;
}

/**
 * Utilities for selecting Midnight ratifier routes.
 *
 * Call these during make-side preparation, before `Offer.create`, when an app
 * must decide whether a maker can sign an Ecrecover root or must approve a
 * Setter root onchain. Fetch helpers read bytecode for you; this namespace is
 * the pure classification logic.
 *
 * @example
 * ```ts
 * import { RatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(RatifierUtils.isEip7702Designator("0xef0100"));
 * ```
 */
export namespace RatifierUtils {
  /**
   * Normalizes a ratifier tree input and asserts it uses one ratifier address.
   *
   * Pass an existing `Tree` or `TreeLike` object to reuse cached offers,
   * leaves, root, and height. Pass raw offer/group input when the caller has
   * not materialized a tree yet.
   *
   * @param params.tree - Tree-like object or raw offer/group input.
   * @param params.label - Ratifier label used in validation errors.
   * @returns Normalized tree-like data and its shared ratifier.
   * @throws {InvalidTreeError} when the tree is empty or contains multiple ratifiers.
   * @throws {InvalidTreeHeightError} when normalized raw input exceeds the supported tree height.
   * @example
   * ```ts
   * import { Offer, RatifierUtils } from "@morpho-org/midnight-sdk";
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
   * const { tree, ratifier } = RatifierUtils.normalizeRatifierTree({
   *   tree: [offer],
   *   label: "Ecrecover",
   * });
   * console.log(tree.root, ratifier);
   * ```
   */
  export function normalizeRatifierTree(params: {
    readonly tree: RatifierTreeInput;
    readonly label: "Ecrecover" | "Setter";
  }): { readonly tree: TreeLike; readonly ratifier: Address } {
    const tree = normalizeTree(params.tree);
    const ratifier = assertRatifierTree({ tree, label: params.label });

    return { tree, ratifier };
  }

  /**
   * Checks whether bytecode is an EIP-7702 designator.
   *
   * EIP-7702 accounts have code-like bytecode but still sign as the owning EOA,
   * so they use the Ecrecover ratifier route instead of the Setter route.
   *
   * @param bytecode - Account bytecode.
   * @returns Whether the bytecode starts with `0xef0100`.
   * @example
   * ```ts
   * import { RatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(RatifierUtils.isEip7702Designator("0xef0100"));
   * ```
   */
  export function isEip7702Designator(bytecode: Hex) {
    return bytecode.toLowerCase().startsWith("0xef0100");
  }

  /**
   * Selects Ecrecover for EOAs/EIP-7702 accounts and Setter for deployed-code
   * accounts.
   *
   * Use the returned `ratifier` address in `Offer.create`. Later, use
   * `EcrecoverRatifierUtils.ratify` when `type` is `ecrecover`, or approve the
   * root and call `SetterRatifierUtils.ratify` when `type` is `setter`.
   *
   * @param params.bytecode - Maker bytecode returned by `eth_getCode`.
   * @param params.ecrecoverRatifier - Ratifier address used for EOAs and EIP-7702 accounts.
   * @param params.setterRatifier - Ratifier address used for deployed-code accounts.
   * @returns Ratifier information for the maker.
   * @example
   * ```ts
   * import { RatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const info = RatifierUtils.getRatifierInfo({
   *   bytecode: "0x",
   *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
   *   setterRatifier: "0x0000000000000000000000000000000000000002",
   * });
   * console.log(info.type);
   * ```
   */
  export function getRatifierInfo(params: GetRatifierInfoParams): RatifierInfo {
    const ecrecoverRatifier = params.ecrecoverRatifier;
    const setterRatifier = params.setterRatifier;
    const bytecode = params.bytecode;
    if (
      bytecode == null ||
      bytecode === "0x" ||
      isEip7702Designator(bytecode)
    ) {
      return { type: "ecrecover", ratifier: ecrecoverRatifier };
    }

    return { type: "setter", ratifier: setterRatifier };
  }
}

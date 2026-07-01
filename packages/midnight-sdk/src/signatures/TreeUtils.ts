import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Account, Address, Chain, Client, Hash, Transport } from "viem";
import { MidnightApi } from "../api/MidnightApi.js";
import type {
  MempoolPayloadValidationResult,
  MidnightApiFetch,
  MidnightApiRequestOptions,
} from "../api/types.js";
import { MidnightMempoolValidationError } from "../errors.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import {
  EcrecoverRatifierUtils,
  type EcrecoverSignatureInput,
} from "./EcrecoverRatifierUtils.js";
import { Group } from "./Group.js";
import type { GroupInput } from "./GroupUtils.js";
import {
  encode as encodePayload,
  type Item as PayloadItem,
} from "./Payload.js";
import { SetterRatifierUtils } from "./SetterRatifierUtils.js";
import type { Tree } from "./Tree.js";
import {
  buildTreeDescriptor,
  buildTreeProof,
  hashTreeNode,
} from "./treeInternal.js";

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
 * `Tree`. Ratifier helpers accept {@link RatifierTreeInput} instead, so they
 * can reuse an existing `Tree` or normalize raw offer/group input.
 *
 * @example
 * ```ts
 * import { Offer, type TreeInput } from "@morpho-org/midnight-sdk";
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
 * const tree: TreeInput = [offer];
 * console.log(tree);
 * ```
 */
export type TreeInput = Tree | TreeCreateParams;

/**
 * Tree-shaped data required by ratifier helpers.
 *
 * A `Tree` class instance satisfies this shape and is the optimal input when a
 * caller already built one, because the cached offers, leaves, root, and height
 * are reused for signatures and proofs. Plain objects with these fields are
 * also accepted by ratifier helpers.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type TreeLike } from "@morpho-org/midnight-sdk";
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
 * const tree: TreeLike = Tree.create([offer]);
 * console.log(tree.root);
 * ```
 */
export interface TreeLike {
  /** Non-padding offers in leaf order. */
  readonly offers: readonly IOffer[];
  /** ABI-compatible offers in leaf order, including protocol-zero padding. */
  readonly paddedOffers: readonly OfferStruct[];
  /** Leaf hashes for `paddedOffers`. */
  readonly leaves: readonly Hash[];
  /** Merkle root. */
  readonly root: Hash;
  /** Tree height. */
  readonly height: number;
}

/**
 * Tree-like input accepted by ratifier helpers.
 *
 * Pass a `Tree` or {@link TreeLike} object to reuse cached hashes and proofs.
 * Pass raw offer/group input when convenience matters more than avoiding a
 * one-time tree materialization.
 *
 * @example
 * ```ts
 * import { Offer, type RatifierTreeInput } from "@morpho-org/midnight-sdk";
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
 * const tree: RatifierTreeInput = [offer];
 * console.log(tree);
 * ```
 */
export type RatifierTreeInput = TreeLike | TreeCreateParams;

/**
 * Optional ratification inputs for {@link Tree.mempoolValidate}.
 *
 * Omit this when validating offer policy before the maker signs or approves a
 * tree. Provide it when validating the final payload shape, including real
 * `ratifierData`, after the Ecrecover signature exists or the Setter root is
 * ready for publication.
 *
 * @example
 * ```ts
 * import { zeroHash, type Signature } from "viem";
 * import type { TreeMempoolValidateRatification } from "@morpho-org/midnight-sdk";
 *
 * const ratification: TreeMempoolValidateRatification = {
 *   type: "ecrecover",
 *   signature: { v: 27, r: zeroHash, s: zeroHash } satisfies Signature,
 * };
 * console.log(ratification.type);
 * ```
 */
export type TreeMempoolValidateRatification =
  | {
      /** Ecrecover ratifier route. */
      readonly type: "ecrecover";
      /** Viem client whose transport signs typed data built from the tree. */
      readonly client: Client<Transport, Chain, Account | undefined>;
      /** Account that signs the tree root. */
      readonly account: Account | Address;
      /** Omit when the SDK should request the signature through `client`. */
      readonly signature?: undefined;
    }
  | {
      /** Ecrecover ratifier route. */
      readonly type: "ecrecover";
      /** Precomputed signature for this tree root. */
      readonly signature: EcrecoverSignatureInput;
      /** Omit when a precomputed signature is supplied. */
      readonly client?: undefined;
      /** Omit when a precomputed signature is supplied. */
      readonly account?: undefined;
    }
  | {
      /** Setter ratifier route. */
      readonly type: "setter";
    };

/**
 * Parameters for {@link Tree.mempoolValidate}.
 *
 * Use this when an already-created tree should be validated by the Midnight
 * API. By default it validates the pre-ratification tree with empty
 * `ratifierData`; pass `ratification` to validate the final payload shape with
 * real ratifier data.
 *
 * @example
 * ```ts
 * import { Offer, Tree, type TreeMempoolValidateParams } from "@morpho-org/midnight-sdk";
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
 * const params = { chainId: 8453 } satisfies TreeMempoolValidateParams;
 * await tree.mempoolValidate(params);
 * ```
 */
export interface TreeMempoolValidateParams {
  /** Chain id whose API policy should validate the tree. */
  readonly chainId: number;
  /** Midnight API URL used for the validation HTTP request. Defaults to `https://api.morpho.org/v1/midnight`. */
  readonly apiUrl?: string | URL;
  /** Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot. */
  readonly timestamp?: string | Date;
  /** Fetch implementation used for the API call. Defaults to the global `fetch`. */
  readonly fetch?: MidnightApiFetch;
  /** Additional fetch options forwarded to the API request. */
  readonly request?: MidnightApiRequestOptions;
  /** Optional ratification inputs used to validate final payload bytes with real ratifier data. */
  readonly ratification?: TreeMempoolValidateRatification;
}

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
   * Validates a tree against Midnight mempool API policy.
   *
   * This is an API-backed convenience: by default it encodes each tree leaf
   * with empty `ratifierData`, then sends the temporary payload to the Midnight
   * API `POST /mempool/validate` endpoint. Pass `ratification` after signing or
   * Setter root preparation to validate final payload bytes with real
   * `ratifierData`.
   *
   * @param params.chainId - Chain id whose API policy should validate the tree.
   * @param params.tree - Offer tree to validate.
   * @param params.apiUrl - Optional Midnight API URL override used for the validation HTTP request.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @param params.fetch - Optional fetch implementation override used for the API call.
   * @param params.request - Optional fetch options forwarded to the API request.
   * @param params.ratification - Optional ratification inputs used to validate final payload bytes with real ratifier data.
   * @returns Successful API validation result.
   * @throws {InvalidTreeError} when the tree is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the resulting height is unsupported.
   * @throws {Payload.DecodeError} when validation payload encoding fails.
   * @throws {MidnightApiError} when the API returns a non-2xx response.
   * @throws {InvalidMidnightApiResponseError} when the API returns malformed success JSON.
   * @throws {MidnightMempoolValidationError} when the API returns validation issues.
   * @example
   * ```ts
   * import { Offer, TreeUtils } from "@morpho-org/midnight-sdk";
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
   * await TreeUtils.mempoolValidate({
   *   chainId: 8453,
   *   tree: [offer],
   * });
   * ```
   */
  export async function mempoolValidate(
    params: Pick<
      TreeMempoolValidateParams,
      "chainId" | "apiUrl" | "timestamp" | "fetch" | "request"
    > & {
      readonly tree: TreeInput;
      readonly ratification?: TreeMempoolValidateRatification;
    },
  ): Promise<MempoolPayloadValidationResult> {
    let items: readonly PayloadItem[];
    if (params.ratification == null) {
      const offers =
        "paddedOffers" in params.tree
          ? params.tree.offers
          : params.tree.flatMap((entry) =>
              "offers" in entry
                ? Group.from(entry).offers
                : [Offer.from(entry)],
            );

      if (!("paddedOffers" in params.tree)) {
        buildTreeDescriptor(params.tree);
      }

      items = offers.map((offer) => ({
        offer,
        ratifierData: "0x" as const,
      }));
    } else if (params.ratification.type === "ecrecover") {
      if (params.ratification.signature != null) {
        items = await EcrecoverRatifierUtils.ratify({
          tree: params.tree,
          signature: params.ratification.signature,
        });
      } else {
        items = await EcrecoverRatifierUtils.ratify({
          tree: params.tree,
          client: params.ratification.client,
          account: params.ratification.account,
        });
      }
    } else {
      items = SetterRatifierUtils.ratify({ tree: params.tree });
    }

    const payload = await encodePayload(items);

    const validation = await MidnightApi.validateMempoolPayload({
      baseUrl: params.apiUrl,
      fetch: params.fetch,
      request: params.request,
      chainId: params.chainId,
      timestamp: params.timestamp,
      payload,
    });

    if (!validation.valid) {
      throw new MidnightMempoolValidationError(validation.issues);
    }

    return validation;
  }

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
    return hashTreeNode(left, right);
  }

  /**
   * Builds a tree descriptor and Merkle root. Non-power-of-two batches are
   * padded with protocol-zero offers at the highest leaf indices.
   *
   * Use after `Group.create` or standalone `Offer.create` when you need the
   * padded leaves for custom signing, root approval, or proof construction.
   * Groups are encoded with their derived shared group id, and standalone
   * offers are encoded with their own group id.
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
   * const tree = TreeUtils.buildDescriptor([offer]);
   * console.log(tree.root);
   * ```
   */
  export function buildDescriptor(entries: TreeCreateParams): TreeDescriptor {
    return buildTreeDescriptor(entries);
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
   * @param params.tree - Tree-like data with the root and leaves that contain the leaf.
   * @param params.leafIndex - Leaf index to prove.
   * @returns Proof descriptor.
   * @throws {InvalidTreeError} when leaf index is out of range.
   * @example
   * ```ts
   * import { Offer, Tree, TreeUtils } from "@morpho-org/midnight-sdk";
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
   * const proof = TreeUtils.buildProof({
   *   tree: Tree.create([offer]),
   *   leafIndex: 0n,
   * });
   * console.log(proof.proof.length);
   * ```
   */
  export function buildProof(params: {
    readonly tree: Pick<TreeLike, "leaves" | "root">;
    readonly leafIndex: BigIntish;
  }): TreeProof {
    return buildTreeProof(params);
  }

  /**
   * Verifies a local Merkle proof against a root.
   *
   * Use on the take-side or in tests to inspect decoded payload or ratifier
   * data before forwarding it to a transaction builder. Onchain ratifiers still
   * perform the authoritative verification.
   *
   * @param params.offer - Offer whose hash starts proof reconstruction.
   * @param params.root - Expected Merkle root.
   * @param params.leafIndex - Leaf index proven by `params.proof`.
   * @param params.proof - Merkle proof siblings for the leaf.
   * @returns Whether the proof reconstructs the supplied root.
   * @example
   * ```ts
   * import { Offer, Tree, TreeUtils } from "@morpho-org/midnight-sdk";
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

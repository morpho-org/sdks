import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import type { Hash } from "viem";
import { MidnightApi } from "../api/MidnightApi.js";
import type { MempoolPayloadValidationSuccess } from "../api/types.js";
import { InvalidTreeError, MidnightMempoolValidationError } from "../errors.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";
import { Payload } from "./Payload.js";
import { PriceRatifierV1 } from "./PriceRatifierV1.js";
import { RateRatifierV1 } from "./RateRatifierV1.js";
import { Ratifier } from "./Ratifier.js";
import {
  type TreeCreateParams,
  type TreeInput,
  type TreeMempoolValidateParams,
  type TreeProof,
  TreeUtils,
} from "./TreeUtils.js";
import type {
  AnyTree,
  AnyTreeSnapshot,
  RatifierKind,
  TreeCreateRequest,
  TreeData,
  TreeEntry,
  TreeSnapshot,
  TypedTreeMempoolValidateParams,
} from "./treeTypes.js";

export type {
  RatifierTreeInput,
  TreeCreateParams,
  TreeDescriptor,
  TreeInput,
  TreeLike,
  TreeMempoolValidateParams,
  TreeMempoolValidateRatification,
  TreeProof,
} from "./TreeUtils.js";

/**
 * Maker-side Merkle tree used by Midnight ratifiers.
 *
 * Build a tree after offers have been created and related offers have been
 * grouped. The tree root is what Ecrecover makers sign, Setter makers approve,
 * and payload items later prove with per-leaf ratifier data. Price/Rate V1
 * trees carry their additional leaf commitments and use onchain root approval.
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
export class Tree<K extends RatifierKind | undefined = undefined> {
  /** Explicit route, or undefined for a legacy standard tree. */
  public readonly type: K;

  /** Complete padded leaf commitments for this route. */
  public readonly entries: readonly TreeEntry<K>[];
  /** Non-padding offers in leaf order. */
  public readonly offers: readonly Offer[];

  /** ABI-compatible offers in leaf order, including protocol-zero padding. */
  public readonly paddedOffers: readonly OfferStruct[];

  /** Leaf hashes for the complete padded `entries`. */
  public readonly leaves: readonly Hash[];

  /** Merkle root. */
  public readonly root: Hash;

  /** Tree height. */
  public readonly height: number;

  private constructor(type: K, descriptor: TreeData<TreeEntry<K>>) {
    this.type = type;
    this.offers = Object.freeze(
      descriptor.offers.map((offer) => Offer.from(offer)),
    );
    this.entries = deepFreeze(structuredClone(descriptor.entries));
    const entries: readonly TreeEntry<RatifierKind | undefined>[] =
      this.entries;
    this.paddedOffers = Object.freeze(
      entries.map((entry) => ("offer" in entry ? entry.offer : entry)),
    );
    this.leaves = Object.freeze([...descriptor.leaves]);
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
   * @throws {InvalidRateRatifierV1RateError} when a Rate leaf has a negative rate.
   * @throws {InvalidRateRatifierV1TickError} when a Rate leaf offer tick is below `RateRatifierV1.MIN_TICK`.
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
  public static from<T extends AnyTree | TreeCreateRequest>(
    tree: T,
  ): Extract<AnyTree, { readonly type: T["type"] }>;
  /**
   * Resolves an untagged standard tree or legacy creation input.
   * @deprecated Pass a tagged TreeCreateRequest or a route-typed Tree instead.
   * @param tree - Legacy tree, offer, group, or array of entries.
   * @returns Untagged standard tree.
   * @throws {InvalidTreeError} When entries are empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} When the tree height is unsupported.
   * @example
   * ```ts
   * import { Tree, type TreeInput } from "@morpho-org/midnight-sdk";
   * function legacyTree(input: TreeInput) { return Tree.from(input); }
   * ```
   */
  public static from(tree: TreeInput): Tree;
  public static from(
    tree: AnyTree | TreeCreateRequest | TreeInput,
  ): AnyTree | Tree {
    if (tree instanceof Tree) return tree;
    if ("type" in tree && tree.type != null) return Tree.create(tree);
    return Tree.create(Array.isArray(tree) ? tree : [tree]);
  }

  /**
   * Creates a route-typed tree from standard offer/groups or Price/Rate leaf inputs.
   *
   * Use after `Offer.create` and optional `Group.create`, before
   * `Tree.mempoolValidate`, `EcrecoverRatifier.ratify`, or
   * `SetterRatifier.ratify`. Groups are flattened, and every standalone
   * offer is normalized as a singleton group using the router-compatible group
   * id algorithm.
   *
   * @param params.type - Ratifier route selecting the leaf commitment format.
   * @param params.entries - Standard offer/groups or route-specific leaves in leaf order.
   * @returns A tree whose entries and validation options are inferred from the route.
   * @throws {InvalidTreeError} when the tree is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the resulting height is unsupported.
   * @throws {InvalidRateRatifierV1RateError} when a Rate leaf has a negative rate.
   * @throws {InvalidRateRatifierV1TickError} when a Rate leaf offer tick is below `RateRatifierV1.MIN_TICK`.
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
   * const tree = Tree.create({ type: "ecrecover", entries: [offer] });
   * console.log(tree.height);
   * ```
   */
  public static create<R extends TreeCreateRequest>(
    params: R,
  ): Extract<AnyTree, { readonly type: R["type"] }>;
  /**
   * Creates a legacy tree compatible with Ecrecover and Setter.
   * @deprecated Pass `{ type, entries }` to select a ratifier explicitly.
   * @param params - Standard offer/group inputs.
   * @returns Untagged standard tree.
   * @throws {InvalidTreeError} when the tree is empty, all padding, or duplicated.
   * @throws {InvalidTreeHeightError} when the resulting height is unsupported.
   * @example
   * ```ts
   * import { Tree, type IOffer } from "@morpho-org/midnight-sdk";
   * function legacyTree(offers: readonly IOffer[]) { return Tree.create(offers); }
   * ```
   */
  public static create(params: TreeCreateParams): Tree;
  public static create(
    params: TreeCreateRequest | TreeCreateParams,
  ): AnyTree | Tree {
    if ("type" in params) {
      const descriptor = TreeUtils.buildDescriptor(params);
      switch (descriptor.type) {
        case "ecrecover":
          return new Tree("ecrecover", descriptor);
        case "setter":
          return new Tree("setter", descriptor);
        case "priceV1":
          return new Tree("priceV1", descriptor);
        case "rateV1":
          return new Tree("rateV1", descriptor);
      }
    }
    const offers = params.flatMap((entry) =>
      GroupUtils.isGroupInput(entry)
        ? Group.from(entry).offers
        : [
            new Offer({
              ...Offer.from(entry as IOffer),
              group: GroupUtils.hash([entry as IOffer]),
            }),
          ],
    );
    const descriptor = TreeUtils.buildDescriptor(params);
    return new Tree(undefined, {
      ...descriptor,
      offers,
      entries: descriptor.offers,
    });
  }

  /**
   * Exports plain normalized data for transport; does not claim root authorization.
   * @returns Descriptor with the same route and padded commitments.
   * @example
   * ```ts
   * import { Tree, type IOffer } from "@morpho-org/midnight-sdk";
   * function prepare(offers: readonly IOffer[]) {
   *   return Tree.create({ type: "setter", entries: offers }).toDescriptor();
   * }
   * ```
   */
  public toDescriptor(): TreeSnapshot<K> {
    return deepFreeze({
      type: this.type,
      entries: [...this.entries],
      offers: this.paddedOffers.slice(0, this.offers.length),
      leaves: [...this.leaves],
      root: this.root,
      height: this.height,
    });
  }

  /**
   * Validates portable data before constructing a tree. Hashes and padding are checked again.
   * @param descriptor - Tagged descriptor, or legacy untagged snapshot.
   * @returns A new tree with the descriptor's route.
   * @throws {InvalidTreeError} When entries, offers, padding, hashes or root disagree.
   * @throws {InvalidTreeHeightError} When height is unsupported.
   * @example
   * ```ts
   * import { Tree, type TreeSnapshot } from "@morpho-org/midnight-sdk";
   * function resume(snapshot: TreeSnapshot<"rateV1">) {
   *   return Tree.fromDescriptor(snapshot); // Tree<"rateV1">
   * }
   * ```
   */
  public static fromDescriptor<D extends AnyTreeSnapshot>(
    descriptor: D,
  ): Extract<AnyTree, { readonly type: D["type"] }>;
  public static fromDescriptor(descriptor: TreeSnapshot<undefined>): Tree;
  public static fromDescriptor(
    descriptor: AnyTreeSnapshot | TreeSnapshot<undefined>,
  ): AnyTree | Tree {
    switch (descriptor.type) {
      case "priceV1":
        // Validate caller-controlled hashes, offers and padding before constructing an instance.
        PriceRatifierV1.buildProof({ tree: descriptor, leafIndex: 0n });
        return new Tree("priceV1", {
          ...descriptor,
          entries: descriptor.entries.map((entry, index) => ({
            allowedTaker: entry.allowedTaker,
            offer:
              index < descriptor.offers.length
                ? OfferUtils.toStruct({ offer: entry.offer })
                : entry.offer,
          })),
        });
      case "rateV1":
        // Validate caller-controlled hashes, offers and padding before constructing an instance.
        RateRatifierV1.buildProof({ tree: descriptor, leafIndex: 0n });
        return new Tree("rateV1", {
          ...descriptor,
          entries: descriptor.entries.map((entry, index) => ({
            rate: entry.rate,
            allowedTaker: entry.allowedTaker,
            offer:
              index < descriptor.offers.length
                ? OfferUtils.toStruct({ offer: entry.offer })
                : entry.offer,
          })),
        });
      case "ecrecover":
      case "setter":
      case undefined: {
        // Validate the complete standard offer commitment without reassigning groups.
        Ratifier.normalizeRatifierTree({
          tree: { ...descriptor, paddedOffers: descriptor.entries },
          label: descriptor.type === "setter" ? "Setter" : "Ecrecover",
        });
        const normalized = {
          ...descriptor,
          entries: descriptor.entries.map((offer, index) =>
            index < descriptor.offers.length
              ? OfferUtils.toStruct({ offer })
              : offer,
          ),
        };
        if (descriptor.type === "ecrecover")
          return new Tree("ecrecover", normalized);
        if (descriptor.type === "setter") return new Tree("setter", normalized);
        return new Tree(undefined, normalized);
      }
      default:
        throw new InvalidTreeError("Unsupported tree ratifier route.");
    }
  }

  /**
   * Validates this tree against Midnight mempool API policy.
   *
   * This is an API-backed convenience: by default it encodes each tree leaf
   * with empty `ratifierData`, then sends the temporary payload to the Midnight
   * API `POST /mempool/validate` endpoint. Pass `ratification` after signing or
   * Setter root preparation to validate final payload bytes with real
   * `ratifierData`.
   *
   * @param params.chainId - Chain id whose API policy should validate this tree.
   * @param params.apiUrl - Optional Midnight API URL override used for the validation HTTP request.
   * @param params.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
   * @param params.fetch - Optional fetch implementation override used for the API call.
   * @param params.request - Optional fetch options forwarded to the API request.
   * @param params.ratification - Optional route-matching authorization inputs; Price/Rate routes require their root to have been approved onchain.
   * @returns Successful API validation result with `valid: true`.
   * @throws {InvalidTreeError} when the ratification route differs from the tree route.
   * @throws {PayloadDecodeError} when validation payload encoding fails.
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
  public async mempoolValidate(
    params: TypedTreeMempoolValidateParams<K>,
  ): Promise<MempoolPayloadValidationSuccess> {
    const descriptor = this.toDescriptor();
    if (
      params.ratification != null &&
      (this.type == null
        ? params.ratification.type !== "ecrecover" &&
          params.ratification.type !== "setter"
        : params.ratification.type !== this.type)
    ) {
      throw new InvalidTreeError(
        "Ratification route does not match the tree route.",
      );
    }
    if (this.type !== "priceV1" && this.type !== "rateV1") {
      return TreeUtils.mempoolValidate({
        ...params,
        ratification:
          params.ratification as TreeMempoolValidateParams["ratification"],
        tree: Tree.fromDescriptor({
          ...descriptor,
          type: undefined,
          entries: this.paddedOffers,
        }),
      });
    }
    const items =
      params.ratification == null
        ? this.offers.map((offer) => ({ offer, ratifierData: "0x" as const }))
        : this.type === "priceV1"
          ? PriceRatifierV1.ratify({
              tree: descriptor as TreeSnapshot<"priceV1">,
            })
          : RateRatifierV1.ratify({
              tree: descriptor as TreeSnapshot<"rateV1">,
            });
    const result = await MidnightApi.validateMempoolPayload({
      baseUrl: params.apiUrl,
      fetch: params.fetch,
      request: params.request,
      chainId: params.chainId,
      timestamp: params.timestamp,
      payload: await Payload.encode(items),
    });
    if (!result.valid) throw new MidnightMempoolValidationError(result.issues);
    return { valid: true, issues: result.issues };
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

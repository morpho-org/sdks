import type { Hash } from "viem";
import type { IOffer, OfferStruct } from "../offers/index.js";
import type {
  PriceRatifierV1Leaf,
  PriceRatifierV1LeafStruct,
} from "./PriceRatifierV1.js";
import type {
  RateRatifierV1Leaf,
  RateRatifierV1LeafStruct,
} from "./RateRatifierV1.js";
import type { Tree } from "./Tree.js";
import type {
  RatifierTreeInput,
  TreeCreateParams,
  TreeLike,
  TreeMempoolValidateParams,
  TreeMempoolValidateRatification,
} from "./TreeUtils.js";

/** Associates each ratifier route with its construction input and committed leaf. */
export type RatifierTypes = {
  /** Ecrecover signs standard offer trees. */
  readonly ecrecover: {
    readonly input: TreeCreateParams;
    readonly entry: OfferStruct;
  };
  /** Setter approves standard offer trees onchain. */
  readonly setter: {
    readonly input: TreeCreateParams;
    readonly entry: OfferStruct;
  };
  /** Price V1 commits to price and taker restrictions. */
  readonly priceV1: {
    readonly input: readonly PriceRatifierV1Leaf[];
    readonly entry: PriceRatifierV1LeafStruct;
  };
  /** Rate V1 commits to rate and taker restrictions. */
  readonly rateV1: {
    readonly input: readonly RateRatifierV1Leaf[];
    readonly entry: RateRatifierV1LeafStruct;
  };
};

/** Explicit ratifier routes supported by a typed tree. */
export type RatifierKind = keyof RatifierTypes;

/** Normalized entry for a route; undefined retains the legacy standard format. */
export type TreeEntry<K extends RatifierKind | undefined> =
  K extends RatifierKind ? RatifierTypes[K]["entry"] : OfferStruct;

/** Correlated construction request: a route always travels with its own inputs. */
export type TreeCreateRequest = {
  [K in RatifierKind]: {
    readonly type: K;
    readonly entries: RatifierTypes[K]["input"];
  };
}[RatifierKind];

/** Shared materialized leaf data, independent of ratifier authorization. */
export interface TreeData<E> {
  /** Padded normalized entries in leaf order. */
  readonly entries: readonly E[];
  /** Non-padding offers in leaf order. */
  readonly offers: readonly IOffer[];
  /** Hashes of all padded entries. */
  readonly leaves: readonly Hash[];
  /** Merkle root. */
  readonly root: Hash;
  /** Merkle height. */
  readonly height: number;
}

/** Portable descriptor; callers must validate it before trusting its hashes. */
export interface TreeSnapshot<K extends RatifierKind | undefined>
  extends TreeData<TreeEntry<K>> {
  /** Route selecting normalization, hashing and authorization. */
  readonly type: K;
}

/** Union preserving the relationship between a descriptor's route and entries. */
export type AnyTreeSnapshot = {
  [K in RatifierKind]: TreeSnapshot<K>;
}[RatifierKind];

/** Union that narrows entries when its route tag is narrowed. */
export type AnyTree = { [K in RatifierKind]: Tree<K> }[RatifierKind];

/** API validation options restricted to a tree's authorization route. */
export type TypedTreeMempoolValidateParams<K extends RatifierKind | undefined> =
  Omit<TreeMempoolValidateParams, "ratification"> & {
    readonly ratification?: K extends "priceV1" | "rateV1"
      ? { readonly type: K }
      : K extends "ecrecover" | "setter"
        ? Extract<TreeMempoolValidateRatification, { readonly type: K }>
        : TreeMempoolValidateRatification;
  };

/**
 * Standard ratifier input accepting the original untagged contract or a matching tagged tree.
 * Deliberately widening a tagged tree to a legacy type erases static route information;
 * ratifier utilities still validate any runtime tag before use.
 */
export type TypedRatifierTreeInput<K extends "ecrecover" | "setter"> =
  | (RatifierTreeInput & { readonly type?: undefined })
  | (TreeLike & { readonly type: K });

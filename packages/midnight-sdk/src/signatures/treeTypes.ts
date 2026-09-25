import type { Hash } from "viem";
import type { IOffer, OfferStruct } from "../offers/index.js";
import type { GroupInput } from "./GroupUtils.js";
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
  TreeLike,
  TreeMempoolValidateParams,
  TreeMempoolValidateRatification,
} from "./TreeUtils.js";

/** Creation request for an Ecrecover tree; its root is authorized by signature. */
export interface EcrecoverTreeCreateRequest {
  /** Selects standard offer hashing and Ecrecover authorization. */
  readonly type: "ecrecover";
  /** Groups or standalone offers in leaf order. */
  readonly entries: readonly GroupInput[];
}

/** Creation request for a Setter tree; its root is approved onchain. */
export interface SetterTreeCreateRequest {
  /** Selects standard offer hashing and Setter authorization. */
  readonly type: "setter";
  /** Groups or standalone offers in leaf order. */
  readonly entries: readonly GroupInput[];
}

/** Creation request for a Price V1 tree with per-leaf taker restrictions. */
export interface PriceRatifierV1TreeCreateRequest {
  /** Selects Price V1 leaf commitments. */
  readonly type: "priceV1";
  /** Price-bounded offer leaves in leaf order. */
  readonly entries: readonly PriceRatifierV1Leaf[];
}

/** Creation request for a Rate V1 tree with per-leaf rate and taker restrictions. */
export interface RateRatifierV1TreeCreateRequest {
  /** Selects Rate V1 leaf commitments. */
  readonly type: "rateV1";
  /** Rate-bounded offer leaves in leaf order. */
  readonly entries: readonly RateRatifierV1Leaf[];
}

/** Tagged construction API; each variant keeps its route and entries together. */
export type TreeCreateRequest =
  | EcrecoverTreeCreateRequest
  | SetterTreeCreateRequest
  | PriceRatifierV1TreeCreateRequest
  | RateRatifierV1TreeCreateRequest;

/** Associates each ratifier route with its construction input and committed leaf. */
export type RatifierTypes = {
  /** Ecrecover signs standard offer trees. */
  readonly ecrecover: {
    readonly input: EcrecoverTreeCreateRequest["entries"];
    readonly entry: OfferStruct;
  };
  /** Setter approves standard offer trees onchain. */
  readonly setter: {
    readonly input: SetterTreeCreateRequest["entries"];
    readonly entry: OfferStruct;
  };
  /** Price V1 commits to price and taker restrictions. */
  readonly priceV1: {
    readonly input: PriceRatifierV1TreeCreateRequest["entries"];
    readonly entry: PriceRatifierV1LeafStruct;
  };
  /** Rate V1 commits to rate and taker restrictions. */
  readonly rateV1: {
    readonly input: RateRatifierV1TreeCreateRequest["entries"];
    readonly entry: RateRatifierV1LeafStruct;
  };
};

/** Explicit ratifier routes supported by a typed tree. */
export type RatifierKind = keyof RatifierTypes;

/** Normalized entry for a route; undefined retains the legacy standard format. */
export type TreeEntry<K extends RatifierKind | undefined> =
  K extends RatifierKind ? RatifierTypes[K]["entry"] : OfferStruct;

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
 * Compatibility input accepting the original untagged contract or a matching tagged tree.
 * @deprecated Use TreeSnapshot with the required route for the new ratifier APIs.
 * Deliberately widening a tagged tree to a legacy type erases static route information;
 * ratifier utilities still validate any runtime tag before use.
 */
export type TypedRatifierTreeInput<K extends "ecrecover" | "setter"> =
  | (RatifierTreeInput & { readonly type?: undefined })
  | (TreeLike & { readonly type: K });

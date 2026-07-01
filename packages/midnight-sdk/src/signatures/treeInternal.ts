import { type BigIntish, deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, concat, type Hash, keccak256 } from "viem";
import { InvalidTreeError, InvalidTreeHeightError } from "../errors.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import { Group } from "./Group.js";
import { GroupUtils } from "./GroupUtils.js";
import {
  EMPTY_OFFER_STRUCT,
  isEmptyOfferStruct,
} from "./offerStructInternal.js";
import type {
  RatifierTreeInput,
  TreeCreateParams,
  TreeDescriptor,
  TreeLike,
  TreeProof,
} from "./TreeUtils.js";

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function padOfferStructs(offers: readonly OfferStruct[]): OfferStruct[] {
  if (isPowerOfTwo(offers.length)) return [...offers];
  const paddedLength = nextPowerOfTwo(offers.length);

  return [
    ...offers,
    ...Array.from(
      { length: paddedLength - offers.length },
      () => EMPTY_OFFER_STRUCT,
    ),
  ];
}

function assertLeafOffers(
  offers: readonly OfferStruct[],
  leafHashes: readonly Hash[],
): void {
  const seen = new Set<Hash>();
  for (const [index, offer] of offers.entries()) {
    if (isEmptyOfferStruct(offer, { allowDefaultGroup: true })) continue;

    const leafHash = leafHashes[index]!;
    if (seen.has(leafHash)) {
      throw new InvalidTreeError(`Duplicate offer hash "${leafHash}" in tree.`);
    }
    seen.add(leafHash);
  }

  if (seen.size === 0) {
    throw new InvalidTreeError("Tree must not be empty.");
  }
}

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

/** @internal */
export function hashTreeNode(left: Hash, right: Hash) {
  return keccak256(concat([left, right]));
}

/** @internal */
export function buildTreeDescriptor(entries: TreeCreateParams): TreeDescriptor {
  const structs = entries.flatMap((entry) =>
    "offers" in entry
      ? GroupUtils.toStructs(entry)
      : [OfferUtils.toStruct({ offer: entry })],
  );
  if (structs.length === 0) {
    throw new InvalidTreeError("Tree must not be empty.");
  }

  const offerStructs = padOfferStructs(structs);
  const leaves = offerStructs.map(OfferUtils.hashStruct);
  assertLeafOffers(offerStructs, leaves);

  const height = Math.log2(offerStructs.length);
  if (height > 20) throw new InvalidTreeHeightError(height);

  let level = [...leaves];

  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(hashTreeNode(level[i]!, level[i + 1]!));
    }
    level = next;
  }

  return deepFreeze({
    offers: offerStructs,
    leaves,
    root: level[0]!,
    height,
  });
}

/** @internal */
export function buildTreeProof(params: {
  readonly tree: Pick<TreeLike, "leaves" | "root">;
  readonly leafIndex: BigIntish;
}): TreeProof {
  const leafIndex = BigInt(params.leafIndex);
  if (leafIndex < 0n || leafIndex >= BigInt(params.tree.leaves.length)) {
    throw new InvalidTreeError(
      `Leaf index "${leafIndex}" is outside the tree.`,
    );
  }

  let index = Number(leafIndex);
  let level = [...params.tree.leaves];
  const proof: Hash[] = [];
  while (level.length > 1) {
    proof.push(level[index ^ 1]!);
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(hashTreeNode(level[i]!, level[i + 1]!));
    }
    index = Math.floor(index / 2);
    level = next;
  }

  return deepFreeze({ root: params.tree.root, leafIndex, proof });
}

/** @internal */
export function normalizeRatifierTreeInput(tree: RatifierTreeInput): TreeLike {
  if (isTreeLike(tree)) return tree;

  const offers: readonly IOffer[] = tree.flatMap((entry) =>
    "offers" in entry ? Group.from(entry).offers : [Offer.from(entry)],
  );
  const descriptor = buildTreeDescriptor(offers);

  return {
    offers,
    paddedOffers: descriptor.offers,
    leaves: descriptor.leaves,
    root: descriptor.root,
    height: descriptor.height,
  };
}

/** @internal */
export function getRatifierTreeRatifier(params: {
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

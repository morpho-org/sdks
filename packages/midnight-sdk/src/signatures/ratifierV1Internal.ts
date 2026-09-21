import { type Address, type Hash, isAddressEqual, zeroAddress } from "viem";
import { MAX_TREE_HEIGHT } from "../constants.js";
import {
  InvalidRatifierV1AddressError,
  InvalidTreeError,
  InvalidTreeHeightError,
  RatifierV1TakerNotAllowedError,
} from "../errors.js";
import {
  type IOffer,
  Offer,
  type OfferStruct,
  OfferUtils,
} from "../offers/index.js";
import { isZeroAddress } from "./offerStructInternal.js";
import { TreeUtils } from "./TreeUtils.js";
import { isPowerOfTwo, nextPowerOfTwo } from "./treeMathInternal.js";

/** @internal Padded V1 ratifier leaf descriptor shared by the V1 ratifier utils. */
export interface RatifierV1Descriptor<TStruct> {
  /** Leaf structs in leaf order, including trailing padding. */
  readonly entries: readonly TStruct[];
  /** Leaf hashes for the padded tree. */
  readonly leaves: readonly Hash[];
  /** Merkle root. */
  readonly root: Hash;
  /** Tree height. */
  readonly height: number;
}

/**
 * @internal Pads, hash-checks, and roots a V1 ratifier leaf list.
 *
 * All non-padding entries must share one ratifier address and produce distinct
 * leaf hashes. Non-power-of-two lists are padded with `padding` at the highest
 * leaf indices, matching `TreeUtils.buildDescriptor` semantics.
 */
export function buildRatifierV1Descriptor<TStruct>(params: {
  readonly entries: readonly TStruct[];
  readonly padding: TStruct;
  readonly hashLeaf: (entry: TStruct) => Hash;
  readonly ratifierOf: (entry: TStruct) => Address;
  readonly label: string;
}): RatifierV1Descriptor<TStruct> {
  const { entries, padding, hashLeaf, ratifierOf, label } = params;
  const first = entries[0];
  if (first == null) {
    throw new InvalidTreeError("Tree must not be empty.");
  }

  const ratifier = ratifierOf(first);
  for (const entry of entries.slice(1)) {
    const other = ratifierOf(entry);
    if (!isAddressEqual(other, ratifier)) {
      throw new InvalidTreeError(
        `All offers in a ${label} tree must use one ratifier; expected "${ratifier}", got "${other}". Build separate trees per ratifier.`,
      );
    }
  }

  const entryHashes = entries.map(hashLeaf);
  const seen = new Set<Hash>();
  for (const leafHash of entryHashes) {
    if (seen.has(leafHash)) {
      throw new InvalidTreeError(`Duplicate leaf hash "${leafHash}" in tree.`);
    }
    seen.add(leafHash);
  }

  const paddingCount = isPowerOfTwo(entries.length)
    ? 0
    : nextPowerOfTwo(entries.length) - entries.length;
  const paddedEntries = [
    ...entries,
    ...Array.from({ length: paddingCount }, () => padding),
  ];
  const paddingHash = paddingCount === 0 ? undefined : hashLeaf(padding);
  const leaves = [
    ...entryHashes,
    ...Array.from({ length: paddingCount }, () => paddingHash!),
  ];
  const { root, height } = TreeUtils.buildRootFromLeaves(leaves);

  return { entries: paddedEntries, leaves, root, height };
}

/**
 * @internal Resolves a V1 ratifier tree input into a materialized descriptor.
 *
 * Caller-provided descriptors are fully re-validated: height, lengths, leaf
 * hashes, visible-offer correspondence, padding placement, and the Merkle
 * root must all agree, mirroring `RatifierUtils.normalizeTree`.
 */
export function resolveRatifierV1Tree<
  TStruct extends { readonly offer: OfferStruct },
  TLeaf,
  TDescriptor extends RatifierV1Descriptor<TStruct> & {
    readonly offers: readonly IOffer[];
  },
>(
  tree: TDescriptor | readonly TLeaf[],
  helpers: {
    readonly buildDescriptor: (leaves: readonly TLeaf[]) => TDescriptor;
    readonly hashLeaf: (entry: TStruct) => Hash;
    readonly isPadding: (entry: TStruct) => boolean;
    readonly ratifierOf: (entry: TStruct) => Address;
    readonly label: string;
  },
): TDescriptor {
  const { buildDescriptor, hashLeaf, isPadding, ratifierOf, label } = helpers;
  if (Array.isArray(tree)) return buildDescriptor(tree as readonly TLeaf[]);

  const descriptor = tree as TDescriptor;
  if (
    !Number.isInteger(descriptor.height) ||
    descriptor.height < 0 ||
    descriptor.height > MAX_TREE_HEIGHT
  ) {
    throw new InvalidTreeHeightError(descriptor.height);
  }

  if (descriptor.offers.length === 0) {
    throw new InvalidTreeError("Tree must not be empty.");
  }

  const expectedLength = 2 ** descriptor.height;
  if (
    descriptor.entries.length !== expectedLength ||
    descriptor.leaves.length !== expectedLength ||
    descriptor.offers.length > expectedLength
  ) {
    throw new InvalidTreeError(
      "Tree entries, leaves, offers, and height describe different trees.",
    );
  }

  const visibleEntries = descriptor.entries.slice(0, descriptor.offers.length);
  const ratifier = ratifierOf(visibleEntries[0]!);
  for (const entry of visibleEntries.slice(1)) {
    const other = ratifierOf(entry);
    if (!isAddressEqual(other, ratifier)) {
      throw new InvalidTreeError(
        `All offers in a ${label} tree must use one ratifier; expected "${ratifier}", got "${other}". Build separate trees per ratifier.`,
      );
    }
  }

  const computedLeaves = descriptor.entries.map((entry) => hashLeaf(entry));
  const seen = new Set<string>();
  for (const [index, offer] of descriptor.offers.entries()) {
    const entry = descriptor.entries[index]!;
    if (isPadding(entry)) {
      throw new InvalidTreeError(
        "Visible offers must not contain tree padding.",
      );
    }
    if (
      OfferUtils.hashStruct(
        OfferUtils.toStruct({ offer: Offer.from(offer) }),
      ).toLowerCase() !== OfferUtils.hashStruct(entry.offer).toLowerCase()
    ) {
      throw new InvalidTreeError(
        "Visible offers do not match the tree entries.",
      );
    }
    const leafHash = computedLeaves[index]!.toLowerCase();
    if (seen.has(leafHash)) {
      throw new InvalidTreeError(`Duplicate leaf hash "${leafHash}" in tree.`);
    }
    seen.add(leafHash);
  }

  if (
    descriptor.entries
      .slice(descriptor.offers.length)
      .some((entry) => !isPadding(entry))
  ) {
    throw new InvalidTreeError(
      "Tree padding contains entries hidden from the visible offer list.",
    );
  }

  if (
    computedLeaves.some(
      (leaf, index) =>
        leaf.toLowerCase() !== descriptor.leaves[index]!.toLowerCase(),
    )
  ) {
    throw new InvalidTreeError("Tree leaves do not match its entries.");
  }

  if (
    TreeUtils.buildRootFromLeaves(descriptor.leaves).root.toLowerCase() !==
    descriptor.root.toLowerCase()
  ) {
    throw new InvalidTreeError("Tree root does not match its leaves.");
  }

  return descriptor;
}

/**
 * @internal Asserts a V1 ratifier address is deployed (non-zero).
 */
export function assertRatifierV1Address(ratifier: Address): void {
  if (isZeroAddress(ratifier)) {
    throw new InvalidRatifierV1AddressError(ratifier);
  }
}

/**
 * @internal Asserts a take-side taker matches the leaf's allowed taker.
 */
export function assertRatifierV1Taker(params: {
  readonly taker: Address | undefined;
  readonly allowedTaker: Address;
}): void {
  const { taker, allowedTaker } = params;
  if (
    taker == null ||
    isAddressEqual(allowedTaker, zeroAddress) ||
    isAddressEqual(taker, allowedTaker)
  ) {
    return;
  }

  throw new RatifierV1TakerNotAllowedError({ taker, allowedTaker });
}

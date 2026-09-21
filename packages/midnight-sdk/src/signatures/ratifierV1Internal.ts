import { type Address, type Hash, isAddressEqual, zeroAddress } from "viem";
import { InvalidTreeError, RatifierV1TakerNotAllowedError } from "../errors.js";
import { TreeUtils } from "./TreeUtils.js";

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

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

  const seen = new Set<Hash>();
  for (const entry of entries) {
    const leafHash = hashLeaf(entry);
    if (seen.has(leafHash)) {
      throw new InvalidTreeError(`Duplicate leaf hash "${leafHash}" in tree.`);
    }
    seen.add(leafHash);
  }

  const paddedEntries = isPowerOfTwo(entries.length)
    ? [...entries]
    : [
        ...entries,
        ...Array.from(
          { length: nextPowerOfTwo(entries.length) - entries.length },
          () => padding,
        ),
      ];
  const leaves = paddedEntries.map(hashLeaf);
  const { root, height } = TreeUtils.buildRoot(leaves);

  return { entries: paddedEntries, leaves, root, height };
}

/**
 * @internal Resolves a V1 ratifier tree input into a materialized descriptor.
 */
export function resolveRatifierV1Tree<
  TLeaf,
  TDescriptor extends { readonly entries: readonly unknown[] },
>(
  tree: TDescriptor | readonly TLeaf[],
  buildDescriptor: (leaves: readonly TLeaf[]) => TDescriptor,
): TDescriptor {
  return Array.isArray(tree)
    ? buildDescriptor(tree as readonly TLeaf[])
    : (tree as TDescriptor);
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

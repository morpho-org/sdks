import { InvalidTreeError } from "../errors.js";

/** @internal Reads a tree item at a required index, rejecting missing entries. */
export function requireTreeItem<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item == null) {
    throw new InvalidTreeError(`Tree item at index "${index}" is missing.`);
  }
  return item;
}

/** @internal Returns whether `value` is a positive power of two. */
export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** @internal Returns the smallest power of two greater than or equal to `value`. */
export function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

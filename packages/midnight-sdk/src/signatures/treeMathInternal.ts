/** @internal Returns whether `value` is a positive power of two. */
export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** @internal Returns the smallest power of two greater than or equal to `value`. */
export function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

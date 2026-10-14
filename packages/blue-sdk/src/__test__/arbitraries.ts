import { fc } from "@fast-check/vitest";

/** @internal Largest uint128 value. */
export const MAX_UINT_128 = 2n ** 128n - 1n;

/** @internal Largest sampled market or vault total. */
export const MAX_TOTAL = 2n ** 127n;

const DUST_MAX = 10n ** 7n;

/** @internal Morpho's virtual share amount for test reference formulas. */
export const VIRTUAL_SHARES = 1_000_000n;

/**
 * Edge-biased values from an inclusive range.
 * @internal
 */
export const edgeBiased = (min: bigint, max: bigint) => {
  const dustMax = max < DUST_MAX ? max : DUST_MAX;
  const boundedDustMax = dustMax < min ? min : dustMax;
  const edges = min === 0n && max >= 1n ? [min, 1n, max] : [min, max];

  return fc.oneof(
    fc.constantFrom(...edges),
    fc.bigInt({ min, max: boundedDustMax }),
    fc.bigInt({ min, max }),
  );
};

/**
 * Amount and total domains keep products within uint256, where Solidity's
 * `mulDiv` does not revert.
 * @internal
 */
export const amount = edgeBiased(0n, MAX_UINT_128);

/** @internal Edge-biased market and vault total samples. */
export const total = edgeBiased(0n, MAX_TOTAL);

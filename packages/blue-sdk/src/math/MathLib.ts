import { WAD as SHARED_WAD } from "@morpho-org/morpho-ts";

import type { BigIntish } from "../types.js";

/** Rounding direction used by fixed-point math helpers. */
export type RoundingDirection = "Up" | "Down";

/**
 * Library to manage fixed-point arithmetic.
 * https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MathLib.sol
 */
export namespace MathLib {
  /** WAD scale used for 18-decimal fixed-point values. */
  export const WAD = SHARED_WAD;
  /** RAY scale used for 27-decimal fixed-point values. */
  export const RAY = 1_000000000000000000000000000n;

  /** Maximum unsigned integer representable with 256 bits. */
  export const MAX_UINT_256 = maxUint(256);
  /** Maximum unsigned integer representable with 160 bits. */
  export const MAX_UINT_160 = maxUint(160);
  /** Maximum unsigned integer representable with 128 bits. */
  export const MAX_UINT_128 = maxUint(128);
  /** Maximum unsigned integer representable with 48 bits. */
  export const MAX_UINT_48 = maxUint(48);

  /**
   * Returns the maximum unsigned integer representable with a bit width.
   *
   * @param nBits - The bit width, which must be divisible by 4.
   * @returns The maximum unsigned integer representable by `nBits`.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const max = MathLib.maxUint(8);
   * // max === 255n
   * ```
   */
  export function maxUint(nBits: number) {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);

    return BigInt(`0x${"f".repeat(nBits / 4)}`);
  }

  /**
   * Returns the absolute value of a number
   * @param a The number
   * @returns The absolute value as a bigint.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.abs(-2n);
   * // value === 2n
   * ```
   */
  export function abs(a: BigIntish) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    a = BigInt(a);

    return a >= 0 ? a : -a;
  }

  /**
   * Returns the smallest number given as param
   * @param xs The numbers to compare.
   * @returns The smallest value as a bigint.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.min(2n, 1n, 3n);
   * // value === 1n
   * ```
   */
  export function min(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
  }

  /**
   * Returns the greatest number given as param
   * @param xs The numbers to compare.
   * @returns The greatest value as a bigint.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.max(2n, 1n, 3n);
   * // value === 3n
   * ```
   */
  export function max(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
  }

  /**
   * Returns the subtraction of b from a, floored to zero if negative
   * @param x The first number
   * @param y The second number
   * @returns `x - y`, floored to `0n`.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.zeroFloorSub(1n, 2n);
   * // value === 0n
   * ```
   */
  export function zeroFloorSub(x: BigIntish, y: BigIntish) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    x = BigInt(x);
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    y = BigInt(y);

    return x <= y ? 0n : x - y;
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   * @returns The WAD-scaled product rounded down.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.wMulDown(MathLib.WAD, 2n * MathLib.WAD);
   * // value === 2n * MathLib.WAD
   * ```
   */
  export function wMulDown(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   * @returns The WAD-scaled product rounded up.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.wMulUp(1n, MathLib.WAD);
   * // value === 1n
   * ```
   */
  export function wMulUp(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
   * @param rounding The rounding direction.
   * @returns The WAD-scaled product rounded as requested.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.wMul(MathLib.WAD, MathLib.WAD, "Down");
   * // value === MathLib.WAD
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function wMul(
    x: BigIntish,
    y: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib.mulDiv(x, y, MathLib.WAD, rounding);
  }

  /**
   * Perform the WAD-based division of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   * @returns The WAD-scaled quotient rounded down.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.wDivDown(MathLib.WAD, 2n * MathLib.WAD);
   * // value === 500000000000000000n
   * ```
   */
  export function wDivDown(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   * @returns The WAD-scaled quotient rounded up.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.wDivUp(MathLib.WAD, 2n * MathLib.WAD);
   * // value === 500000000000000000n
   * ```
   */
  export function wDivUp(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
   * @param rounding The rounding direction.
   * @returns The WAD-scaled quotient rounded as requested.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.wDiv(MathLib.WAD, MathLib.WAD, "Down");
   * // value === MathLib.WAD
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function wDiv(
    x: BigIntish,
    y: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib.mulDiv(x, MathLib.WAD, y, rounding);
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding down the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   * @returns `x * y / denominator`, rounded down.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.mulDivDown(5n, 2n, 3n);
   * // value === 3n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function mulDivDown(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
  ) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    x = BigInt(x);
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    y = BigInt(y);
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    return (x * y) / denominator;
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding up the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   * @returns `x * y / denominator`, rounded up.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.mulDivUp(5n, 2n, 3n);
   * // value === 4n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function mulDivUp(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    x = BigInt(x);
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    y = BigInt(y);
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    const roundup = (x * y) % denominator > 0 ? 1n : 0n;

    return (x * y) / denominator + roundup;
  }

  /**
   * Multiplies two numbers and divides by a denominator.
   *
   * @param x - The first number.
   * @param y - The second number.
   * @param denominator - The denominator.
   * @param rounding - The rounding direction.
   * @returns `x * y / denominator`, rounded as requested.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const value = MathLib.mulDiv(5n, 2n, 3n, "Down");
   * // value === 3n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function mulDiv(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib[`mulDiv${rounding}`](x, y, denominator);
  }

  /**
   * The sum of the first three non-zero terms of a Taylor expansion of e^(nx) - 1,
   * to approximate a continuously compounded interest rate.
   *
   * @param x The base of the exponent
   * @param n The exponent
   * @returns The WAD-scaled compounded rate approximation.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const compounded = MathLib.wTaylorCompounded(1n, 1n);
   * // compounded satisfies bigint
   * ```
   */
  export function wTaylorCompounded(x: BigIntish, n: BigIntish) {
    const firstTerm = BigInt(x) * BigInt(n);
    const secondTerm = MathLib.mulDivDown(
      firstTerm,
      firstTerm,
      2n * MathLib.WAD,
    );
    const thirdTerm = MathLib.mulDivDown(
      secondTerm,
      firstTerm,
      3n * MathLib.WAD,
    );

    return firstTerm + secondTerm + thirdTerm;
  }

  /**
   * Converts a WAD-based quantity to a RAY-based quantity.
   * @param x The WAD-based quantity.
   * @returns The same quantity scaled to RAY precision.
   * @example
   * ```ts
   * import { MathLib } from "@morpho-org/blue-sdk";
   *
   * const ray = MathLib.wToRay(MathLib.WAD);
   * // ray === MathLib.RAY
   * ```
   */
  export function wToRay(x: BigIntish) {
    return BigInt(x) * 1_000000000n;
  }
}

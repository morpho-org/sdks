import {
  WAD as SHARED_WAD,
  mulDivDown as sharedMulDivDown,
  mulDivUp as sharedMulDivUp,
  zeroFloorSub as sharedZeroFloorSub,
} from "@morpho-org/morpho-ts";

import type { BigIntish } from "../types.js";

export type RoundingDirection = "Up" | "Down";

/**
 * Library to manage fixed-point arithmetic.
 * https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MathLib.sol
 */
export namespace MathLib {
  export const WAD = SHARED_WAD;
  export const RAY = 1_000000000000000000000000000n;

  export const MAX_UINT_256 = maxUint(256);
  export const MAX_UINT_160 = maxUint(160);
  export const MAX_UINT_128 = maxUint(128);
  export const MAX_UINT_48 = maxUint(48);

  export function maxUint(nBits: number) {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);

    return BigInt(`0x${"f".repeat(nBits / 4)}`);
  }

  /**
   * Returns the absolute value of a number
   * @param a The number
   */
  export function abs(a: BigIntish) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    a = BigInt(a);

    return a >= 0 ? a : -a;
  }

  /**
   * Returns the smallest number given as param
   * @param x The first number
   * @param y The second number
   */
  export function min(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
  }

  /**
   * Returns the greatest number given as param
   * @param x The first number
   * @param y The second number
   */
  export function max(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
  }

  /**
   * Returns the subtraction of b from a, floored to zero if negative
   * @param x The first number
   * @param y The second number
   */
  export function zeroFloorSub(x: BigIntish, y: BigIntish) {
    return sharedZeroFloorSub(x, y);
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   */
  export function wMulDown(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   */
  export function wMulUp(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
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
   */
  export function wDivDown(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   */
  export function wDivUp(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
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
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function mulDivDown(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
  ) {
    return sharedMulDivDown(x, y, denominator);
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding up the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function mulDivUp(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    return sharedMulDivUp(x, y, denominator);
  }

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
   */
  export function wToRay(x: BigIntish) {
    return BigInt(x) * 1_000000000n;
  }
}

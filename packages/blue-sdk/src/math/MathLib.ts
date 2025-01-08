import type { BigIntish } from "../types.js";

export type RoundingDirection = "Up" | "Down";

/**
 * Library to manage fixed-point arithmetic.
 * https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MathLib.sol
 */
export namespace MathLib {
  export const WAD = 1_000000000000000000n;

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
    x = BigInt(x);
    y = BigInt(y);

    return x <= y ? 0n : x - y;
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
  export function mulDivDown(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
  ) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    return (x * y) / denominator;
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding up the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   */
  export function mulDivUp(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    const roundup = (x * y) % denominator > 0 ? 1n : 0n;

    return (x * y) / denominator + roundup;
  }

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
}

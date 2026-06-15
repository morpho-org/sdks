import { DivisionByZeroError, InvalidBitLengthError } from "./errors.js";
import type { BigIntish } from "./types.js";

/**
 * Rounding direction used by fixed-point multiplication and division helpers.
 *
 * @example
 * ```ts
 * import type { RoundingDirection } from "@morpho-org/morpho-ts";
 *
 * const rounding: RoundingDirection = "Down";
 * ```
 */
export type RoundingDirection = "Up" | "Down";

/**
 * Library to manage fixed-point arithmetic.
 *
 * @example
 * ```ts
 * import { MathLib } from "@morpho-org/morpho-ts";
 *
 * console.log(MathLib.wMulDown(MathLib.WAD, 42n));
 * ```
 */
export namespace MathLib {
  /** WAD fixed-point scale, equal to 1e18. */
  export const WAD = 1_000000000000000000n;
  /** RAY fixed-point scale, equal to 1e27. */
  export const RAY = 1_000000000000000000000000000n;

  /** Maximum uint256 value. */
  export const MAX_UINT_256 = maxUint(256);
  /** Maximum uint160 value. */
  export const MAX_UINT_160 = maxUint(160);
  /** Maximum uint128 value. */
  export const MAX_UINT_128 = maxUint(128);
  /** Maximum uint48 value. */
  export const MAX_UINT_48 = maxUint(48);

  /**
   * Returns `2 ** nBits - 1`.
   *
   * @param nBits - Nibble-aligned bit length.
   * @returns Maximum unsigned integer for the bit length.
   * @throws InvalidBitLengthError when `nBits` is not positive or not divisible by four.
   */
  export function maxUint(nBits: number) {
    if (nBits <= 0 || nBits % 4 !== 0) throw new InvalidBitLengthError(nBits);

    return BigInt(`0x${"f".repeat(nBits / 4)}`);
  }

  /**
   * Returns the absolute value of a number.
   *
   * @param a - The number accepted by `BigInt`.
   * @returns The absolute value.
   * @throws When `BigInt` cannot convert the input.
   */
  export function abs(a: BigIntish) {
    const normalized = BigInt(a);

    return normalized >= 0n ? normalized : -normalized;
  }

  /**
   * Returns the smallest number given as parameter.
   *
   * @param xs - The numbers accepted by `BigInt`.
   * @returns The minimum value.
   * @throws When `BigInt` cannot convert an input.
   */
  export function min(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
  }

  /**
   * Returns the greatest number given as parameter.
   *
   * @param xs - The numbers accepted by `BigInt`.
   * @returns The maximum value.
   * @throws When `BigInt` cannot convert an input.
   */
  export function max(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
  }

  /**
   * Returns `x - y`, floored to zero when `y` is greater than or equal to `x`.
   *
   * @param x - Minuend accepted by `BigInt`.
   * @param y - Subtrahend accepted by `BigInt`.
   * @returns The non-negative difference.
   * @throws When `BigInt` cannot convert an input.
   */
  export function zeroFloorSub(x: BigIntish, y: BigIntish) {
    const normalizedX = BigInt(x);
    const normalizedY = BigInt(y);

    return normalizedX <= normalizedY ? 0n : normalizedX - normalizedY;
  }

  /**
   * Performs the WAD-based multiplication of two numbers, rounded down.
   *
   * @param x - The first number accepted by `BigInt`.
   * @param y - The second number accepted by `BigInt`.
   * @returns The rounded-down WAD product.
   * @throws When `BigInt` cannot convert an input.
   */
  export function wMulDown(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Down");
  }

  /**
   * Performs the WAD-based multiplication of two numbers, rounded up.
   *
   * @param x - The first number accepted by `BigInt`.
   * @param y - The second number accepted by `BigInt`.
   * @returns The rounded-up WAD product.
   * @throws When `BigInt` cannot convert an input.
   */
  export function wMulUp(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Up");
  }

  /**
   * Performs the WAD-based multiplication of two numbers with a rounding direction.
   *
   * @param x - The first number accepted by `BigInt`.
   * @param y - The second number accepted by `BigInt`.
   * @param rounding - Rounding direction.
   * @returns The rounded WAD product.
   * @throws When `BigInt` cannot convert an input.
   */
  // biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
  export function wMul(
    x: BigIntish,
    y: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib.mulDiv(x, y, MathLib.WAD, rounding);
  }

  /**
   * Performs the WAD-based division of two numbers, rounded down.
   *
   * @param x - The numerator accepted by `BigInt`.
   * @param y - The denominator accepted by `BigInt`.
   * @returns The rounded-down WAD quotient.
   * @throws DivisionByZeroError when `y` is zero.
   * @throws When `BigInt` cannot convert an input.
   */
  export function wDivDown(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Down");
  }

  /**
   * Performs the WAD-based division of two numbers, rounded up.
   *
   * @param x - The numerator accepted by `BigInt`.
   * @param y - The denominator accepted by `BigInt`.
   * @returns The rounded-up WAD quotient.
   * @throws DivisionByZeroError when `y` is zero.
   * @throws When `BigInt` cannot convert an input.
   */
  export function wDivUp(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Up");
  }

  /**
   * Performs the WAD-based division of two numbers with a rounding direction.
   *
   * @param x - The numerator accepted by `BigInt`.
   * @param y - The denominator accepted by `BigInt`.
   * @param rounding - Rounding direction.
   * @returns The rounded WAD quotient.
   * @throws DivisionByZeroError when `y` is zero.
   * @throws When `BigInt` cannot convert an input.
   */
  // biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
  export function wDiv(
    x: BigIntish,
    y: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib.mulDiv(x, MathLib.WAD, y, rounding);
  }

  /**
   * Multiplies two numbers and divides by a denominator, rounding down the result.
   *
   * @param x - The first number accepted by `BigInt`.
   * @param y - The second number accepted by `BigInt`.
   * @param denominator - The denominator accepted by `BigInt`.
   * @returns The rounded-down quotient.
   * @throws DivisionByZeroError when `denominator` is zero.
   * @throws When `BigInt` cannot convert an input.
   */
  // biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
  export function mulDivDown(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
  ) {
    const normalizedX = BigInt(x);
    const normalizedY = BigInt(y);
    const normalizedDenominator = BigInt(denominator);
    if (normalizedDenominator === 0n)
      throw new DivisionByZeroError("denominator");

    return (normalizedX * normalizedY) / normalizedDenominator;
  }

  /**
   * Multiplies two numbers and divides by a denominator, rounding up the result.
   *
   * @param x - The first number accepted by `BigInt`.
   * @param y - The second number accepted by `BigInt`.
   * @param denominator - The denominator accepted by `BigInt`.
   * @returns The rounded-up quotient.
   * @throws DivisionByZeroError when `denominator` is zero.
   * @throws When `BigInt` cannot convert an input.
   */
  // biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
  export function mulDivUp(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    const normalizedX = BigInt(x);
    const normalizedY = BigInt(y);
    const normalizedDenominator = BigInt(denominator);
    if (normalizedDenominator === 0n)
      throw new DivisionByZeroError("denominator");

    const product = normalizedX * normalizedY;
    const roundup = product % normalizedDenominator > 0n ? 1n : 0n;

    return product / normalizedDenominator + roundup;
  }

  /**
   * Multiplies two numbers and divides by a denominator with a rounding direction.
   *
   * @param x - The first number accepted by `BigInt`.
   * @param y - The second number accepted by `BigInt`.
   * @param denominator - The denominator accepted by `BigInt`.
   * @param rounding - Rounding direction.
   * @returns The rounded quotient.
   * @throws DivisionByZeroError when `denominator` is zero.
   * @throws When `BigInt` cannot convert an input.
   */
  // biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
  export function mulDiv(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib[`mulDiv${rounding}`](x, y, denominator);
  }

  /**
   * Approximates a continuously compounded interest rate using Taylor expansion.
   *
   * @param x - The base of the exponent accepted by `BigInt`.
   * @param n - The exponent accepted by `BigInt`.
   * @returns The WAD-scaled compounded rate approximation.
   * @throws When `BigInt` cannot convert an input.
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
   *
   * @param x - The WAD-based quantity accepted by `BigInt`.
   * @returns The RAY-based quantity.
   * @throws When `BigInt` cannot convert the input.
   */
  export function wToRay(x: BigIntish) {
    return BigInt(x) * 1_000000000n;
  }
}

import { Time } from "@morpho-org/morpho-ts";

import { format } from "../helpers";
import { BigIntish } from "../types";

export type RoundingDirection = "Up" | "Down";

/**
 * Library to manage fixed-point arithmetic.
 * This library reproduces the behaviour of the solidity library MathLib
 * TODO: add library link
 * @category Maths
 *
 */
export class MathLib {
  static WAD = 1_000000000000000000n;

  static MAX_UINT_256 = MathLib.maxUint(256);
  static MAX_UINT_160 = MathLib.maxUint(160);
  static MAX_UINT_128 = MathLib.maxUint(128);
  static MAX_UINT_48 = MathLib.maxUint(48);

  static maxUint(nBits: number) {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);

    return BigInt("0x" + "f".repeat(nBits / 4));
  }

  /**
   * Returns the absolute value of a number
   * @param a The number
   */
  static abs(a: BigIntish) {
    a = BigInt(a);

    return a >= 0 ? a : -a;
  }

  /**
   * Returns the smallest number given as param
   * @param x The first number
   * @param y The second number
   */
  static min(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
  }

  /**
   * Returns the greatest number given as param
   * @param x The first number
   * @param y The second number
   */
  static max(...xs: BigIntish[]) {
    return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
  }

  /**
   * Returns the subtraction of b from a, floored to zero if negative
   * @param x The first number
   * @param y The second number
   */
  static zeroFloorSub(x: BigIntish, y: BigIntish) {
    x = BigInt(x);
    y = BigInt(y);

    return x <= y ? 0n : x - y;
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   */
  static wMulDown(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   */
  static wMulUp(x: BigIntish, y: BigIntish) {
    return MathLib.wMul(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
   */
  static wMul(x: BigIntish, y: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(x, y, MathLib.WAD, rounding);
  }

  /**
   * Perform the WAD-based division of 2 numbers, rounded down
   * @param x The first number
   * @param y The second number
   */
  static wDivDown(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Down");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers, rounded up
   * @param x The first number
   * @param y The second number
   */
  static wDivUp(x: BigIntish, y: BigIntish) {
    return MathLib.wDiv(x, y, "Up");
  }

  /**
   * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
   * @param x The first number
   * @param y The second number
   */
  static wDiv(x: BigIntish, y: BigIntish, rounding: RoundingDirection) {
    return MathLib.mulDiv(x, MathLib.WAD, y, rounding);
  }

  /**
   * Multiply two numbers and divide by a denominator, rounding down the result
   * @param x The first number
   * @param y The second number
   * @param denominator The denominator
   */
  static mulDivDown(x: BigIntish, y: BigIntish, denominator: BigIntish) {
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
  static mulDivUp(x: BigIntish, y: BigIntish, denominator: BigIntish) {
    x = BigInt(x);
    y = BigInt(y);
    denominator = BigInt(denominator);
    if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

    const roundup = (x * y) % denominator > 0 ? 1n : 0n;

    return (x * y) / denominator + roundup;
  }

  static mulDiv(
    x: BigIntish,
    y: BigIntish,
    denominator: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib[`mulDiv${rounding}`](x, y, denominator);
  }

  /**
   * The sum of the first three non-zero terms of a Taylor expansion of e^(nx) - 1,
   * to approximate a continuous compound interest rate.
   *
   * @param x The base of the exponent
   * @param n The exponent
   */
  static wTaylorCompounded(x: BigIntish, n: BigIntish) {
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
   * Converts an rate to compounded apy
   *
   * @param rate The rate to convert (in WAD)
   * @param period The compounding basis
   */
  static rateToApy(rate: BigIntish, period: Time.PeriodLike) {
    const { unit, duration } = Time.toPeriod(period);
    const factor = Time[unit].from.y(1) / duration;

    return (1 + Number(format.number.of(BigInt(rate), 18))) ** factor - 1;
  }

  /**
   * Converts an apr to compounded apy
   *
   * @param apr The apr to convert (in WAD)
   * @param compounding The compounding basis
   */
  static aprToApy(apr: BigIntish, compounding: Time.PeriodLike) {
    const { unit, duration } = Time.toPeriod(compounding);
    const rate = (BigInt(apr) * BigInt(duration)) / Time[unit].from.y(1n);

    return this.rateToApy(rate, compounding);
  }
}

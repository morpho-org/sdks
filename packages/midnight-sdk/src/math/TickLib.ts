import {
  assertNonNegative,
  type BigIntish,
  DivisionByZeroError,
  MathLib,
} from "@morpho-org/morpho-ts";

import {
  DEFAULT_TICK_SPACING,
  MAX_TICK,
  PRICE_ROUNDING_STEP,
} from "../constants.js";
import {
  InvalidTickSpacingError,
  PriceGreaterThanOneError,
  TickOutOfRangeError,
} from "../errors.js";

/**
 * TypeScript port of Midnight `TickLib`.
 *
 * @example
 * ```ts
 * import { TickLib } from "@morpho-org/midnight-sdk";
 *
 * console.log(TickLib.tickToPrice(6744n));
 * ```
 */
export namespace TickLib {
  /**
   * WAD-scaled natural log of one plus Midnight's tick delta.
   *
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * console.log(TickLib.LN_ONE_PLUS_DELTA);
   * ```
   */
  export const LN_ONE_PLUS_DELTA = 4_987_541_511_039_073n;

  /**
   * WAD-scaled natural log of two.
   *
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * console.log(TickLib.LN_2);
   * ```
   */
  export const LN_2 = 693_147_180_559_945_309n;

  /**
   * Exponent offset used by the Midnight exponential approximation.
   *
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * console.log(TickLib.EXP_OFFSET);
   * ```
   */
  export const EXP_OFFSET = 322_611_214_989_459_870n;

  /**
   * Divides with half-down rounding without validating the denominator.
   *
   * @param x - Dividend.
   * @param d - Divisor.
   * @returns Quotient rounded half down.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const value = TickLib.divHalfDownUnchecked(5n, 2n);
   * console.log(value);
   * ```
   */
  export const divHalfDownUnchecked = (x: bigint, d: bigint) =>
    (x + (d - 1n) / 2n) / d;

  /**
   * Asserts that a tick is non-negative and within Midnight's deployed range.
   *
   * @param tick - Tick to validate.
   * @returns Tick as a bigint.
   * @throws {NegativeValueError} when `tick` is negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const tick = TickLib.assertTickInRange(100n);
   * console.log(tick);
   * ```
   */
  export const assertTickInRange = (tick: BigIntish) => {
    const tickValue = BigInt(tick);
    assertNonNegative("tick", tickValue);
    if (tickValue > MAX_TICK)
      throw new TickOutOfRangeError(tickValue, MAX_TICK);

    return tickValue;
  };

  /**
   * Computes the WAD-scaled exponential approximation used by Midnight ticks.
   *
   * @param x - WAD-scaled exponent.
   * @returns WAD-scaled exponential value.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const value = TickLib.wExp(0n);
   * console.log(value);
   * ```
   */
  export const wExp = (x: bigint): bigint => {
    if (x < 0n) return 1_000000000000000000000000000000000000n / wExp(-x);

    const q = (x + EXP_OFFSET) / LN_2;
    const r = x - q * LN_2;
    const secondTerm = (r * r) / (2n * MathLib.WAD);
    const thirdTerm = (secondTerm * r) / (3n * MathLib.WAD);
    const expR = MathLib.WAD + r + secondTerm + thirdTerm;

    return expR << q;
  };

  /**
   * Converts a Midnight tick into a WAD price.
   *
   * @param tick - Tick in the deployed range.
   * @returns WAD price rounded to `PRICE_ROUNDING_STEP`.
   * @throws {NegativeValueError} when `tick` is negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const price = TickLib.tickToPrice(6744n);
   * console.log(price);
   * ```
   */
  export function tickToPrice(tick: BigIntish) {
    const tickValue = assertTickInRange(tick);

    const exponent = LN_ONE_PLUS_DELTA * (MAX_TICK / 2n - tickValue);
    const rawPrice = divHalfDownUnchecked(
      1_000000000000000000000000000000000000n,
      MathLib.WAD + wExp(exponent),
    );

    return (
      divHalfDownUnchecked(rawPrice, PRICE_ROUNDING_STEP) * PRICE_ROUNDING_STEP
    );
  }

  /**
   * Converts a WAD price into the lowest spacing-aligned tick whose price is at least the input.
   *
   * @param price - WAD price.
   * @param spacing - Tick spacing; defaults to `DEFAULT_TICK_SPACING`.
   * @returns Lowest aligned tick with price greater than or equal to `price`.
   * @throws {NegativeValueError} when `price` is negative.
   * @throws {PriceGreaterThanOneError} when price is above WAD.
   * @throws {InvalidTickSpacingError} when spacing is invalid.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const tick = TickLib.priceToTick(500000000000000000n);
   * console.log(tick);
   * ```
   */
  export function priceToTick(
    price: BigIntish,
    spacing: BigIntish = DEFAULT_TICK_SPACING,
  ) {
    const priceValue = BigInt(price);
    const spacingValue = BigInt(spacing);

    assertNonNegative("price", priceValue);
    if (priceValue > MathLib.WAD)
      throw new PriceGreaterThanOneError(priceValue);
    if (spacingValue <= 0n || MAX_TICK % spacingValue !== 0n) {
      throw new InvalidTickSpacingError(spacingValue);
    }

    let low = 0n;
    let high = MAX_TICK;
    while (low !== high) {
      const mid = (low + high) / 2n;
      if (tickToPrice(mid) < priceValue) low = mid + 1n;
      else high = mid;
    }

    return ((low + spacingValue - 1n) / spacingValue) * spacingValue;
  }

  /**
   * Snaps a WAD price to the price of the lowest spacing-aligned tick at or above it.
   *
   * This is an SDK-only convenience around `priceToTick` and `tickToPrice`.
   *
   * @param price - WAD price.
   * @param spacing - Tick spacing.
   * @returns Snapped WAD price.
   * @throws {NegativeValueError} when `price` is negative.
   * @throws {PriceGreaterThanOneError} when price is above WAD.
   * @throws {InvalidTickSpacingError} when spacing is invalid.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const price = TickLib.snapPriceToTick(500000000000000000n, 4n);
   * console.log(price);
   * ```
   */
  export function snapPriceToTick(
    price: BigIntish,
    spacing: BigIntish = DEFAULT_TICK_SPACING,
  ) {
    return tickToPrice(priceToTick(price, spacing));
  }

  /**
   * Converts a WAD fixed rate into a WAD zero-coupon price.
   *
   * This is an SDK-only rate conversion convenience.
   *
   * @param rate - WAD fixed rate.
   * @returns WAD price rounded down.
   * @throws {NegativeValueError} when `rate` is negative.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const price = TickLib.rateToPrice(50000000000000000n);
   * console.log(price);
   * ```
   */
  export function rateToPrice(rate: BigIntish) {
    const rateValue = BigInt(rate);
    assertNonNegative("rate", rateValue);

    return MathLib.mulDiv(
      MathLib.WAD,
      MathLib.WAD,
      MathLib.WAD + rateValue,
      "Down",
    );
  }

  /**
   * Converts a Midnight tick into a WAD fixed rate.
   *
   * This is an SDK-only rate conversion convenience.
   *
   * @param tick - Midnight tick.
   * @returns WAD fixed rate rounded up.
   * @throws {NegativeValueError} when `tick` is negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @throws {DivisionByZeroError} when the tick price is zero.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const rate = TickLib.tickToRate(6744n);
   * console.log(rate);
   * ```
   */
  export function tickToRate(tick: BigIntish) {
    const price = tickToPrice(tick);
    if (price === 0n) throw new DivisionByZeroError("price");

    return MathLib.mulDiv(MathLib.WAD, MathLib.WAD, price, "Up") - MathLib.WAD;
  }

  /**
   * Asserts that a tick is aligned to the provided spacing.
   *
   * This is an SDK-only tick-domain assertion.
   *
   * @param tick - Tick to validate.
   * @param spacing - Market tick spacing.
   * @returns Tick as a bigint.
   * @throws {NegativeValueError} when `tick` is negative.
   * @throws {TickOutOfRangeError} when `tick` exceeds `MAX_TICK`.
   * @throws {InvalidTickSpacingError} when spacing is invalid or the tick is not aligned.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * TickLib.assertTickAlignedToSpacing(100n, 4n);
   * ```
   */
  export function assertTickAlignedToSpacing(
    tick: BigIntish,
    spacing: BigIntish = DEFAULT_TICK_SPACING,
  ) {
    const tickValue = assertTickInRange(tick);
    const spacingValue = BigInt(spacing);
    if (spacingValue <= 0n || MAX_TICK % spacingValue !== 0n) {
      throw new InvalidTickSpacingError(spacingValue);
    }
    if (tickValue % spacingValue !== 0n) {
      throw new InvalidTickSpacingError(tickValue, spacingValue);
    }

    return tickValue;
  }
}

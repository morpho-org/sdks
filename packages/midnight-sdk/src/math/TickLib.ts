import { MathLib } from "@morpho-org/morpho-ts";

import {
  DEFAULT_TICK_SPACING,
  MAX_TICK,
  PRICE_ROUNDING_STEP,
} from "../constants.js";
import {
  DivisionByZeroError,
  InvalidTickSpacingError,
  NegativeValueError,
  PriceGreaterThanOneError,
  TickOutOfRangeError,
} from "../errors.js";
import type { BigIntish } from "../types.js";

const LN_ONE_PLUS_DELTA = 4_987_541_511_039_073n;
const LN_2 = 693_147_180_559_945_309n;
const EXP_OFFSET = 322_611_214_989_459_870n;

const divHalfDownUnchecked = (x: bigint, d: bigint) => (x + (d - 1n) / 2n) / d;

const assertNonNegative = (field: string, value: bigint) => {
  if (value < 0n) throw new NegativeValueError(field, value);
};

const assertTickInRange = (tick: bigint) => {
  assertNonNegative("tick", tick);
  if (tick > MAX_TICK) throw new TickOutOfRangeError(tick, MAX_TICK);
};

const wExp = (x: bigint): bigint => {
  if (x < 0n) return 1_000000000000000000000000000000000000n / wExp(-x);

  const q = (x + EXP_OFFSET) / LN_2;
  const r = x - q * LN_2;
  const secondTerm = (r * r) / (2n * MathLib.WAD);
  const thirdTerm = (secondTerm * r) / (3n * MathLib.WAD);
  const expR = MathLib.WAD + r + secondTerm + thirdTerm;

  return expR << q;
};

/**
 * TypeScript port of Midnight `TickLib`.
 *
 * @example
 * ```ts
 * import { TickLib } from "@morpho-org/midnight-sdk";
 *
 * console.log(TickLib.tickToPrice(5820n));
 * ```
 */
export namespace TickLib {
  /**
   * Converts a Midnight tick into a WAD price.
   *
   * @param tick - Tick in the deployed range.
   * @returns WAD price rounded to `PRICE_ROUNDING_STEP`.
   * @throws NegativeValueError when `tick` is negative.
   * @throws TickOutOfRangeError when `tick` exceeds `MAX_TICK`.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const price = TickLib.tickToPrice(5820n);
   * console.log(price);
   * ```
   */
  export function tickToPrice(tick: BigIntish) {
    const normalizedTick = BigInt(tick);
    assertTickInRange(normalizedTick);

    const exponent = LN_ONE_PLUS_DELTA * (MAX_TICK / 2n - normalizedTick);
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
   * @throws NegativeValueError when `price` is negative.
   * @throws PriceGreaterThanOneError when price is above WAD.
   * @throws InvalidTickSpacingError when spacing is invalid.
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
    const normalizedPrice = BigInt(price);
    const normalizedSpacing = BigInt(spacing);

    assertNonNegative("price", normalizedPrice);
    if (normalizedPrice > MathLib.WAD)
      throw new PriceGreaterThanOneError(normalizedPrice);
    if (normalizedSpacing <= 0n || MAX_TICK % normalizedSpacing !== 0n) {
      throw new InvalidTickSpacingError(0n, normalizedSpacing);
    }

    let low = 0n;
    let high = MAX_TICK;
    while (low !== high) {
      const mid = (low + high) / 2n;
      if (tickToPrice(mid) < normalizedPrice) low = mid + 1n;
      else high = mid;
    }

    return (
      ((low + normalizedSpacing - 1n) / normalizedSpacing) * normalizedSpacing
    );
  }

  /**
   * Snaps a WAD price to the price of the lowest spacing-aligned tick above it.
   *
   * This is an SDK-only convenience around `priceToTick` and `tickToPrice`.
   *
   * @param price - WAD price.
   * @param spacing - Tick spacing.
   * @returns Snapped WAD price.
   * @throws NegativeValueError when `price` is negative.
   * @throws PriceGreaterThanOneError when price is above WAD.
   * @throws InvalidTickSpacingError when spacing is invalid.
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
   * @throws NegativeValueError when `rate` is negative.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const price = TickLib.rateToPrice(50000000000000000n);
   * console.log(price);
   * ```
   */
  export function rateToPrice(rate: BigIntish) {
    const normalizedRate = BigInt(rate);
    assertNonNegative("rate", normalizedRate);

    return MathLib.mulDivDown(
      MathLib.WAD,
      MathLib.WAD,
      MathLib.WAD + normalizedRate,
    );
  }

  /**
   * Converts a Midnight tick into a WAD fixed rate.
   *
   * This is an SDK-only rate conversion convenience.
   *
   * @param tick - Midnight tick.
   * @returns WAD fixed rate rounded up.
   * @throws NegativeValueError when `tick` is negative.
   * @throws TickOutOfRangeError when `tick` exceeds `MAX_TICK`.
   * @throws DivisionByZeroError when the tick price is zero.
   * @example
   * ```ts
   * import { TickLib } from "@morpho-org/midnight-sdk";
   *
   * const rate = TickLib.tickToRate(5820n);
   * console.log(rate);
   * ```
   */
  export function tickToRate(tick: BigIntish) {
    const price = tickToPrice(tick);
    if (price === 0n) throw new DivisionByZeroError("price");

    return MathLib.mulDivUp(MathLib.WAD, MathLib.WAD, price) - MathLib.WAD;
  }

  /**
   * Asserts that a tick is aligned to the provided spacing.
   *
   * This is an SDK-only tick-domain assertion.
   *
   * @param tick - Tick to validate.
   * @param spacing - Market tick spacing.
   * @returns The normalized tick.
   * @throws NegativeValueError when `tick` is negative.
   * @throws TickOutOfRangeError when `tick` exceeds `MAX_TICK`.
   * @throws InvalidTickSpacingError when spacing is invalid or the tick is not aligned.
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
    const normalizedTick = BigInt(tick);
    const normalizedSpacing = BigInt(spacing);
    assertTickInRange(normalizedTick);
    if (
      normalizedSpacing <= 0n ||
      MAX_TICK % normalizedSpacing !== 0n ||
      normalizedTick % normalizedSpacing !== 0n
    ) {
      throw new InvalidTickSpacingError(normalizedTick, normalizedSpacing);
    }

    return normalizedTick;
  }
}

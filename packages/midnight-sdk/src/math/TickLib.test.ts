import {
  DivisionByZeroError,
  MathLib,
  NegativeValueError,
} from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { MAX_TICK, PRICE_ROUNDING_STEP } from "../constants.js";
import {
  InvalidTickSpacingError,
  PriceGreaterThanOneError,
  TickOutOfRangeError,
} from "../errors.js";
import { TickLib } from "./TickLib.js";

describe("TickLib namespace exports", () => {
  test("default", () => {
    expect(TickLib.LN_ONE_PLUS_DELTA).toBe(4_987_541_511_039_073n);
    expect(TickLib.LN_2).toBe(693_147_180_559_945_309n);
    expect(TickLib.EXP_OFFSET).toBe(322_611_214_989_459_870n);
    expect(TickLib.divHalfDownUnchecked(5n, 2n)).toBe(2n);
    expect(TickLib.assertTickInRange(MAX_TICK)).toBe(MAX_TICK);
    expect(TickLib.wExp(0n)).toBe(MathLib.WAD);
  });

  test("error: TickOutOfRangeError", () => {
    expect(() => TickLib.assertTickInRange(MAX_TICK + 1n)).toThrow(
      TickOutOfRangeError,
    );
  });
});

describe("TickLib.tickToPrice", () => {
  test("default", () => {
    expect(TickLib.tickToPrice(0n)).toBe(0n);
    expect(TickLib.tickToPrice(2n)).toBe(PRICE_ROUNDING_STEP);
    expect(TickLib.tickToPrice(MAX_TICK - 2n)).toBe(
      MathLib.WAD - PRICE_ROUNDING_STEP,
    );
    expect(TickLib.tickToPrice(MAX_TICK)).toBe(MathLib.WAD);
  });

  test("error: TickOutOfRangeError", () => {
    expect(() => TickLib.tickToPrice(MAX_TICK + 1n)).toThrow(
      TickOutOfRangeError,
    );
  });

  test("error: NegativeValueError", () => {
    expect(() => TickLib.tickToPrice(-1n)).toThrow(NegativeValueError);
  });
});

describe("TickLib.priceToTick", () => {
  test("default", () => {
    expect(TickLib.priceToTick(0n, 4n)).toBe(0n);
    expect(TickLib.priceToTick(1n, 4n)).toBe(4n);
    expect(TickLib.priceToTick(PRICE_ROUNDING_STEP, 4n)).toBe(4n);
    expect(TickLib.priceToTick(MathLib.WAD, 4n)).toBe(MAX_TICK);
  });

  test("behavior: returns the lowest aligned tick above the price", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MathLib.WAD }), (price) => {
        const tick = TickLib.priceToTick(price, 4n);
        expect(tick % 4n).toBe(0n);
        expect(TickLib.tickToPrice(tick)).toBeGreaterThanOrEqual(price);
        if (tick > 0n) {
          expect(TickLib.tickToPrice(tick - 4n)).toBeLessThanOrEqual(price);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("error: NegativeValueError", () => {
    expect(() => TickLib.priceToTick(-1n, 4n)).toThrow(NegativeValueError);
  });

  test("error: PriceGreaterThanOneError", () => {
    expect(() => TickLib.priceToTick(MathLib.WAD + 1n, 4n)).toThrow(
      PriceGreaterThanOneError,
    );
  });

  test("error: InvalidTickSpacingError", () => {
    expect(() => TickLib.priceToTick(0n, 0n)).toThrow(InvalidTickSpacingError);
    expect(() => TickLib.priceToTick(0n, 7n)).toThrow(InvalidTickSpacingError);
  });
});

describe("TickLib.snapPriceToTick", () => {
  test("default", () => {
    expect(TickLib.snapPriceToTick(0n, 4n)).toBe(0n);
    expect(TickLib.snapPriceToTick(1n, 4n)).toBe(PRICE_ROUNDING_STEP);
    expect(TickLib.snapPriceToTick(PRICE_ROUNDING_STEP, 4n)).toBe(
      PRICE_ROUNDING_STEP,
    );
    expect(TickLib.snapPriceToTick(MathLib.WAD, 4n)).toBe(MathLib.WAD);
  });

  test("error: NegativeValueError", () => {
    expect(() => TickLib.snapPriceToTick(-1n, 4n)).toThrow(NegativeValueError);
  });

  test("error: PriceGreaterThanOneError", () => {
    expect(() => TickLib.snapPriceToTick(MathLib.WAD + 1n, 4n)).toThrow(
      PriceGreaterThanOneError,
    );
  });

  test("error: InvalidTickSpacingError", () => {
    expect(() => TickLib.snapPriceToTick(0n, 0n)).toThrow(
      InvalidTickSpacingError,
    );
  });
});

describe("TickLib.rateToPrice / tickToRate", () => {
  test("default", () => {
    expect(TickLib.rateToPrice(0n)).toBe(MathLib.WAD);
    expect(TickLib.rateToPrice(1n)).toBe(MathLib.WAD - 1n);
    expect(TickLib.tickToRate(MAX_TICK)).toBe(0n);
  });

  test("error: NegativeValueError", () => {
    expect(() => TickLib.rateToPrice(-1n)).toThrow(NegativeValueError);
    expect(() => TickLib.tickToRate(-1n)).toThrow(NegativeValueError);
  });

  test("error: DivisionByZeroError", () => {
    expect(() => TickLib.tickToRate(0n)).toThrow(DivisionByZeroError);
  });

  test("error: TickOutOfRangeError", () => {
    expect(() => TickLib.tickToRate(MAX_TICK + 1n)).toThrow(
      TickOutOfRangeError,
    );
  });
});

describe("TickLib.assertTickAlignedToSpacing", () => {
  test("default", () => {
    expect(TickLib.assertTickAlignedToSpacing(100n, 4n)).toBe(100n);
  });

  test("error: NegativeValueError", () => {
    expect(() => TickLib.assertTickAlignedToSpacing(-4n, 4n)).toThrow(
      NegativeValueError,
    );
  });

  test("error: TickOutOfRangeError", () => {
    expect(() => TickLib.assertTickAlignedToSpacing(MAX_TICK + 4n, 4n)).toThrow(
      TickOutOfRangeError,
    );
  });

  test("error: InvalidTickSpacingError", () => {
    expect(() => TickLib.assertTickAlignedToSpacing(101n, 4n)).toThrow(
      InvalidTickSpacingError,
    );
    expect(() => TickLib.assertTickAlignedToSpacing(0n, 0n)).toThrow(
      InvalidTickSpacingError,
    );
    expect(() => TickLib.assertTickAlignedToSpacing(0n, 7n)).toThrow(
      InvalidTickSpacingError,
    );
  });
});

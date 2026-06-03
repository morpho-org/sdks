import { WAD } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { MAX_TICK, PRICE_ROUNDING_STEP } from "../constants.js";
import { TickOutOfRangeError } from "../errors.js";
import { TickLib } from "./TickLib.js";

describe("TickLib.tickToPrice", () => {
  test("default", () => {
    expect(TickLib.tickToPrice(0n)).toBe(0n);
    expect(TickLib.tickToPrice(2n)).toBe(PRICE_ROUNDING_STEP);
    expect(TickLib.tickToPrice(MAX_TICK - 2n)).toBe(WAD - PRICE_ROUNDING_STEP);
    expect(TickLib.tickToPrice(MAX_TICK)).toBe(WAD);
  });

  test("error: TickOutOfRangeError", () => {
    expect(() => TickLib.tickToPrice(MAX_TICK + 1n)).toThrow(
      TickOutOfRangeError,
    );
  });
});

describe("TickLib.priceToTick", () => {
  test("behavior: returns the lowest aligned tick above the price", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: WAD }), (price) => {
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
});

describe("TickLib.rateToPrice / tickToRate", () => {
  test("default", () => {
    expect(TickLib.rateToPrice(0n)).toBe(WAD);
    expect(TickLib.tickToRate(MAX_TICK)).toBe(0n);
  });
});

// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount } from "../__test__/arbitraries.js";
import { MathLib } from "../math/MathLib.js";
import type { Address } from "../types.js";
import { ExchangeRateWrappedToken } from "./ExchangeRateWrappedToken.js";

const WRAPPED: Address = "0x1111111111111111111111111111111111111111";
const UNDERLYING: Address = "0x2222222222222222222222222222222222222222";
const rate = fc.oneof(
  fc.constantFrom(1n, MathLib.WAD, 12n * 10n ** 17n, 10n * MathLib.WAD),
  fc.bigInt({ min: 1n, max: 10n * MathLib.WAD }),
);

// ExchangeRateWrappedToken exact-amount conversions apply a WAD-scaled rate.
describe("ExchangeRateWrappedToken", () => {
  test.prop([amount, rate], { numRuns: 1_000 })(
    "default",
    (value, exchangeRate) => {
      const token = new ExchangeRateWrappedToken(
        { address: WRAPPED },
        UNDERLYING,
        exchangeRate,
      );

      for (const rounding of ["Down", "Up"] as const) {
        expect(token.toWrappedExactAmountIn(value, 0n, rounding)).toBe(
          rounding === "Down"
            ? (value * MathLib.WAD) / exchangeRate
            : (value * MathLib.WAD + exchangeRate - 1n) / exchangeRate,
        );
        expect(token.toUnwrappedExactAmountIn(value, 0n, rounding)).toBe(
          rounding === "Down"
            ? (value * exchangeRate) / MathLib.WAD
            : (value * exchangeRate + MathLib.WAD - 1n) / MathLib.WAD,
        );
      }
    },
  );

  test.prop([amount, amount, rate], { numRuns: 1_000 })(
    "behavior: exact-amount-out conversions are enough to receive the target",
    (wrapped, unwrapped, exchangeRate) => {
      const token = new ExchangeRateWrappedToken(
        { address: WRAPPED },
        UNDERLYING,
        exchangeRate,
      );

      expect(
        token.toWrappedExactAmountIn(token.toWrappedExactAmountOut(wrapped)),
      ).toBeGreaterThanOrEqual(wrapped);
      expect(
        token.toUnwrappedExactAmountIn(
          token.toUnwrappedExactAmountOut(unwrapped),
        ),
      ).toBeGreaterThanOrEqual(unwrapped);
    },
  );

  test.prop([amount, amount, rate], { numRuns: 1_000 })(
    "behavior: down round trips never create value",
    (wrapped, unwrapped, exchangeRate) => {
      const token = new ExchangeRateWrappedToken(
        { address: WRAPPED },
        UNDERLYING,
        exchangeRate,
      );

      expect(
        token.toUnwrappedExactAmountIn(
          token.toWrappedExactAmountIn(unwrapped, 0n, "Down"),
          0n,
          "Down",
        ),
      ).toBeLessThanOrEqual(unwrapped);
      expect(
        token.toWrappedExactAmountIn(
          token.toUnwrappedExactAmountIn(wrapped, 0n, "Down"),
          0n,
          "Down",
        ),
      ).toBeLessThanOrEqual(wrapped);
    },
  );
});

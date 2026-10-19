// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount, MAX_UINT_128 } from "../__test__/arbitraries.js";
import type { Address } from "../types.js";
import { ConstantWrappedToken } from "./ConstantWrappedToken.js";

const WRAPPED: Address = "0x1111111111111111111111111111111111111111";
const UNDERLYING: Address = "0x2222222222222222222222222222222222222222";
const decimals = fc.integer({ min: 0, max: 36 });

// ConstantWrappedToken exact-amount conversions rescale by token decimals.
describe("ConstantWrappedToken", () => {
  test.prop([amount, decimals], { numRuns: 1_000 })(
    "default",
    (value, decimalCount) => {
      const token = new ConstantWrappedToken(
        { address: WRAPPED, decimals: decimalCount },
        UNDERLYING,
        decimalCount,
      );

      expect(token.toWrappedExactAmountIn(value)).toBe(value);
      expect(token.toWrappedExactAmountOut(value)).toBe(value);
      expect(token.toUnwrappedExactAmountIn(value)).toBe(value);
      expect(token.toUnwrappedExactAmountOut(value)).toBe(value);
    },
  );

  test.prop([amount, decimals, decimals], { numRuns: 1_000 })(
    "behavior: down round trips never create value",
    (value, wrappedDecimals, underlyingDecimals) => {
      const token = new ConstantWrappedToken(
        { address: WRAPPED, decimals: wrappedDecimals },
        UNDERLYING,
        underlyingDecimals,
      );

      expect(
        token.toUnwrappedExactAmountIn(
          token.toWrappedExactAmountIn(value, 0n, "Down"),
          0n,
          "Down",
        ),
      ).toBeLessThanOrEqual(value);
      expect(
        token.toWrappedExactAmountIn(
          token.toUnwrappedExactAmountIn(value, 0n, "Down"),
          0n,
          "Down",
        ),
      ).toBeLessThanOrEqual(value);
    },
  );

  // Exact-amount-out rounding diverges. Flip to test.prop once the SDK matches.
  test.fails.prop(
    [
      fc.bigInt({ min: 0n, max: MAX_UINT_128 }),
      fc.integer({ min: 0, max: 36 }),
      fc.integer({ min: 0, max: 36 }),
    ],
    {
      examples: [
        [1_000_000_000_001n, 18, 6],
        [1_000_000_000_001n, 6, 18],
      ],
      numRuns: 1_000,
    },
  )(
    "behavior: exact-amount-out conversions are enough to receive the target",
    (value, wrappedDecimals, underlyingDecimals) => {
      const token = new ConstantWrappedToken(
        { address: WRAPPED, decimals: wrappedDecimals },
        UNDERLYING,
        underlyingDecimals,
      );
      expect(
        token.toWrappedExactAmountIn(token.toWrappedExactAmountOut(value)),
      ).toBeGreaterThanOrEqual(value);
      expect(
        token.toUnwrappedExactAmountIn(token.toUnwrappedExactAmountOut(value)),
      ).toBeGreaterThanOrEqual(value);
    },
  );

  // Confirms this expected failure is the tracked divergence; flip it together
  // with the fails.prop.
  test("behavior: pinned exact-amount-out examples return the current rounded values", () => {
    const value = 1_000_000_000_001n;
    const wrapped18Underlying6 = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    const wrappedAmount = wrapped18Underlying6.toWrappedExactAmountOut(value);
    const wrappedRoundTrip =
      wrapped18Underlying6.toWrappedExactAmountIn(wrappedAmount);

    expect(wrappedAmount).toBe(1n);
    expect(wrappedRoundTrip).toBeLessThan(value);
    expect(wrappedRoundTrip).toBe(1_000_000_000_000n);

    const wrapped6Underlying18 = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 6 },
      UNDERLYING,
      18,
    );
    const unwrappedAmount =
      wrapped6Underlying18.toUnwrappedExactAmountOut(value);
    const unwrappedRoundTrip =
      wrapped6Underlying18.toUnwrappedExactAmountIn(unwrappedAmount);

    expect(unwrappedAmount).toBe(1n);
    expect(unwrappedRoundTrip).toBeLessThan(value);
    expect(unwrappedRoundTrip).toBe(1_000_000_000_000n);
  });
});

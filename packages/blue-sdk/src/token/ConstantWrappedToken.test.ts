import { describe, expect, test } from "vitest";
import type { Address } from "../types.js";
import { ConstantWrappedToken } from "./ConstantWrappedToken.js";

const WRAPPED: Address = "0x1111111111111111111111111111111111111111";
const UNDERLYING: Address = "0x2222222222222222222222222222222222222222";

describe("ConstantWrappedToken", () => {
  test("stores underlying decimals as bigint", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    expect(t.underlyingDecimals).toBe(6n);
  });

  test("defaults underlying decimals to 0", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
    );
    expect(t.underlyingDecimals).toBe(0n);
  });

  test("toWrappedExactAmountIn scales by 10^(wrapped - underlying)", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    // 1e6 underlying (= 1.0 unit) -> 1e18 wrapped (= 1.0 unit)
    expect(t.toWrappedExactAmountIn(1_000_000n)).toBe(
      1_000_000_000_000_000_000n,
    );
  });

  test("toUnwrappedExactAmountIn is the inverse", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    expect(t.toUnwrappedExactAmountIn(1_000_000_000_000_000_000n)).toBe(
      1_000_000n,
    );
  });

  test("behavior: honours the rounding direction on inexact conversions", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 6 },
      UNDERLYING,
      18,
    );
    // 1.5e12 underlying wei = 1.5 wrapped units
    const amount = 1_500_000_000_000n;

    expect(t.toWrappedExactAmountIn(amount)).toBe(1n);
    expect(t.toWrappedExactAmountIn(amount, 0n, "Up")).toBe(2n);
    expect(t.toUnwrappedExactAmountOut(amount)).toBe(2n);
    expect(t.toUnwrappedExactAmountOut(amount, 0n, "Down")).toBe(1n);

    const inverse = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    expect(inverse.toUnwrappedExactAmountIn(amount)).toBe(1n);
    expect(inverse.toUnwrappedExactAmountIn(amount, 0n, "Up")).toBe(2n);
    expect(inverse.toWrappedExactAmountOut(amount)).toBe(2n);
    expect(inverse.toWrappedExactAmountOut(amount, 0n, "Down")).toBe(1n);
  });

  test("ignores slippage parameter (always treats as 0)", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    const noSlip = t.toWrappedExactAmountIn(1_000_000n);
    const withSlip = t.toWrappedExactAmountIn(
      1_000_000n,
      1_000_000_000_000_000n,
    );
    expect(withSlip).toBe(noSlip);
  });

  test("toWrappedExactAmountOut returns the unwrapped amount required", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    expect(t.toWrappedExactAmountOut(1_000_000_000_000_000_000n)).toBe(
      1_000_000n,
    );
  });

  test("toUnwrappedExactAmountOut returns the wrapped amount required", () => {
    const t = new ConstantWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      6,
    );
    expect(t.toUnwrappedExactAmountOut(1_000_000n)).toBe(
      1_000_000_000_000_000_000n,
    );
  });
});

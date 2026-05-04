import { describe, expect, test } from "vitest";
import { MathLib } from "../math/MathLib.js";
import type { Address } from "../types.js";
import { ExchangeRateWrappedToken } from "./ExchangeRateWrappedToken.js";

const WRAPPED: Address = "0x1111111111111111111111111111111111111111";
const UNDERLYING: Address = "0x2222222222222222222222222222222222222222";

describe("ExchangeRateWrappedToken", () => {
  test("stores rate and underlying address", () => {
    const t = new ExchangeRateWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      2n * MathLib.WAD,
    );
    expect(t.underlying).toBe(UNDERLYING);
    expect(t.wrappedTokenExchangeRate).toBe(2n * MathLib.WAD);
  });

  test("with rate=2.0, wrap 1 unwrapped -> 0.5 wrapped (rounded down)", () => {
    const t = new ExchangeRateWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      2n * MathLib.WAD,
    );
    // 1 WAD / 2 WAD * WAD = 0.5 WAD
    expect(t.toWrappedExactAmountIn(MathLib.WAD)).toBe(MathLib.WAD / 2n);
  });

  test("with rate=2.0, unwrap 1 wrapped -> 2 unwrapped", () => {
    const t = new ExchangeRateWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      2n * MathLib.WAD,
    );
    // 1 WAD * 2 WAD / WAD = 2 WAD
    expect(t.toUnwrappedExactAmountIn(MathLib.WAD)).toBe(2n * MathLib.WAD);
  });

  test("round-trip without slippage is exact for whole rates", () => {
    const t = new ExchangeRateWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      4n * MathLib.WAD,
    );
    const wrapped = t.toWrappedExactAmountIn(MathLib.WAD);
    const back = t.toUnwrappedExactAmountIn(wrapped);
    expect(back).toBe(MathLib.WAD);
  });

  test("slippage reduces toWrappedExactAmountIn", () => {
    const t = new ExchangeRateWrappedToken(
      { address: WRAPPED, decimals: 18 },
      UNDERLYING,
      MathLib.WAD,
    );
    const noSlip = t.toWrappedExactAmountIn(MathLib.WAD);
    const slip = t.toWrappedExactAmountIn(MathLib.WAD, MathLib.WAD / 100n);
    expect(slip).toBeLessThan(noSlip);
  });
});

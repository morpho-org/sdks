import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_LLTV_BUFFER,
  MAX_ABSOLUTE_SHARE_PRICE,
  MAX_SLIPPAGE_TOLERANCE,
} from "./constant.js";

describe("morpho-sdk helper constants", () => {
  test("MAX_SLIPPAGE_TOLERANCE is 10% (WAD/10)", () => {
    expect(MAX_SLIPPAGE_TOLERANCE).toBe(MathLib.WAD / 10n);
    expect(MAX_SLIPPAGE_TOLERANCE).toBe(100_000_000_000_000_000n);
  });

  test("DEFAULT_LLTV_BUFFER is 0.5% (WAD/200)", () => {
    expect(DEFAULT_LLTV_BUFFER).toBe(MathLib.WAD / 200n);
    expect(DEFAULT_LLTV_BUFFER).toBe(5_000_000_000_000_000n);
  });

  test("MAX_ABSOLUTE_SHARE_PRICE is 100 RAY", () => {
    expect(MAX_ABSOLUTE_SHARE_PRICE).toBe(100n * MathLib.RAY);
  });

  test("constants are positive bigints", () => {
    expect(typeof MAX_SLIPPAGE_TOLERANCE).toBe("bigint");
    expect(typeof DEFAULT_LLTV_BUFFER).toBe("bigint");
    expect(typeof MAX_ABSOLUTE_SHARE_PRICE).toBe("bigint");
    expect(MAX_SLIPPAGE_TOLERANCE).toBeGreaterThan(0n);
    expect(DEFAULT_LLTV_BUFFER).toBeGreaterThan(0n);
    expect(MAX_ABSOLUTE_SHARE_PRICE).toBeGreaterThan(0n);
  });

  test("DEFAULT_LLTV_BUFFER < MAX_SLIPPAGE_TOLERANCE (smaller safety margin than max slippage)", () => {
    expect(DEFAULT_LLTV_BUFFER).toBeLessThan(MAX_SLIPPAGE_TOLERANCE);
  });
});

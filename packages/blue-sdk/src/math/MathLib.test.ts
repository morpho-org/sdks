import { describe, expect, test } from "vitest";
import { MathLib } from "./MathLib.js";

describe("MathLib constants", () => {
  test("WAD = 1e18", () => {
    expect(MathLib.WAD).toBe(1_000_000_000_000_000_000n);
  });
  test("RAY = 1e27", () => {
    expect(MathLib.RAY).toBe(1_000_000_000_000_000_000_000_000_000n);
  });
  test("MAX_UINT_256 = 2^256 - 1", () => {
    expect(MathLib.MAX_UINT_256).toBe(2n ** 256n - 1n);
  });
  test("MAX_UINT_160 = 2^160 - 1", () => {
    expect(MathLib.MAX_UINT_160).toBe(2n ** 160n - 1n);
  });
  test("MAX_UINT_128 = 2^128 - 1", () => {
    expect(MathLib.MAX_UINT_128).toBe(2n ** 128n - 1n);
  });
  test("MAX_UINT_48 = 2^48 - 1", () => {
    expect(MathLib.MAX_UINT_48).toBe(2n ** 48n - 1n);
  });
});

describe("MathLib.maxUint", () => {
  test("returns 2^n - 1 for nibble-aligned n", () => {
    expect(MathLib.maxUint(8)).toBe(2n ** 8n - 1n);
    expect(MathLib.maxUint(64)).toBe(2n ** 64n - 1n);
  });
  test("throws when n is not divisible by 4", () => {
    expect(() => MathLib.maxUint(7)).toThrow(/Invalid number of bits/);
    expect(() => MathLib.maxUint(33)).toThrow(/Invalid number of bits/);
  });
});

describe("MathLib.abs", () => {
  test("positive bigint", () => {
    expect(MathLib.abs(5n)).toBe(5n);
  });
  test("negative bigint", () => {
    expect(MathLib.abs(-5n)).toBe(5n);
  });
  test("zero", () => {
    expect(MathLib.abs(0n)).toBe(0n);
  });
  test("accepts BigIntish (string and number)", () => {
    expect(MathLib.abs("-42")).toBe(42n);
    expect(MathLib.abs(7)).toBe(7n);
  });
});

describe("MathLib.min / MathLib.max", () => {
  test("min of two", () => {
    expect(MathLib.min(2n, 5n)).toBe(2n);
    expect(MathLib.min(5n, 2n)).toBe(2n);
  });
  test("max of two", () => {
    expect(MathLib.max(2n, 5n)).toBe(5n);
    expect(MathLib.max(5n, 2n)).toBe(5n);
  });
  test("variadic min/max", () => {
    expect(MathLib.min(3n, 1n, 4n, 1n, 5n, 9n, 2n, 6n)).toBe(1n);
    expect(MathLib.max(3n, 1n, 4n, 1n, 5n, 9n, 2n, 6n)).toBe(9n);
  });
  test("min/max with single element", () => {
    expect(MathLib.min(42n)).toBe(42n);
    expect(MathLib.max(42n)).toBe(42n);
  });
  test("accepts mixed BigIntish inputs", () => {
    expect(MathLib.min(1, "2", 3n)).toBe(1n);
    expect(MathLib.max(1, "2", 3n)).toBe(3n);
  });
});

describe("MathLib.zeroFloorSub", () => {
  test("returns x - y when x > y", () => {
    expect(MathLib.zeroFloorSub(10n, 3n)).toBe(7n);
  });
  test("returns 0 when x === y", () => {
    expect(MathLib.zeroFloorSub(5n, 5n)).toBe(0n);
  });
  test("returns 0 when x < y (does not go negative)", () => {
    expect(MathLib.zeroFloorSub(3n, 10n)).toBe(0n);
  });
  test("accepts BigIntish", () => {
    expect(MathLib.zeroFloorSub("100", 30)).toBe(70n);
  });
});

describe("MathLib.mulDivDown / MathLib.mulDivUp", () => {
  test("mulDivDown floors the division", () => {
    expect(MathLib.mulDivDown(7n, 3n, 2n)).toBe(10n); // 21/2 = 10.5 -> 10
    expect(MathLib.mulDivDown(10n, 1n, 3n)).toBe(3n); // 10/3 = 3.33 -> 3
  });
  test("mulDivUp ceils the division", () => {
    expect(MathLib.mulDivUp(7n, 3n, 2n)).toBe(11n); // 21/2 = 10.5 -> 11
    expect(MathLib.mulDivUp(10n, 1n, 3n)).toBe(4n); // 10/3 = 3.33 -> 4
  });
  test("mulDivUp does not over-round when exact", () => {
    expect(MathLib.mulDivUp(6n, 1n, 3n)).toBe(2n);
  });
  test("mulDivDown matches mulDivUp when result is exact", () => {
    expect(MathLib.mulDivDown(6n, 1n, 3n)).toBe(2n);
  });
  test("throws DIVISION_BY_ZERO on zero denominator", () => {
    expect(() => MathLib.mulDivDown(1n, 1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
    expect(() => MathLib.mulDivUp(1n, 1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
  });
});

describe("MathLib.mulDiv", () => {
  test("dispatches by rounding direction", () => {
    expect(MathLib.mulDiv(7n, 3n, 2n, "Down")).toBe(10n);
    expect(MathLib.mulDiv(7n, 3n, 2n, "Up")).toBe(11n);
  });
});

describe("MathLib.wMul / MathLib.wMulDown / MathLib.wMulUp", () => {
  test("wMulDown(WAD, x) = x", () => {
    expect(MathLib.wMulDown(MathLib.WAD, 42n)).toBe(42n);
  });
  test("wMulDown of two halves of WAD = WAD/4", () => {
    const half = MathLib.WAD / 2n;
    expect(MathLib.wMulDown(half, half)).toBe(MathLib.WAD / 4n);
  });
  test("wMulUp rounds up when remainder is non-zero", () => {
    // 1 * 1 / WAD = 0 with Down, 1 with Up
    expect(MathLib.wMulDown(1n, 1n)).toBe(0n);
    expect(MathLib.wMulUp(1n, 1n)).toBe(1n);
  });
  test("wMul dispatches by direction", () => {
    expect(MathLib.wMul(1n, 1n, "Down")).toBe(0n);
    expect(MathLib.wMul(1n, 1n, "Up")).toBe(1n);
  });
});

describe("MathLib.wDiv / MathLib.wDivDown / MathLib.wDivUp", () => {
  test("wDivDown(x, WAD) = x", () => {
    expect(MathLib.wDivDown(42n, MathLib.WAD)).toBe(42n);
  });
  test("wDivDown(x, x) = WAD", () => {
    expect(MathLib.wDivDown(7n, 7n)).toBe(MathLib.WAD);
  });
  test("wDivUp ceils the division", () => {
    // 1 / WAD with WAD multiplier => 1/WAD result
    expect(MathLib.wDivDown(1n, 3n * MathLib.WAD)).toBe(0n);
    expect(MathLib.wDivUp(1n, 3n * MathLib.WAD)).toBe(1n);
  });
  test("wDiv dispatches by direction", () => {
    expect(MathLib.wDiv(1n, 3n * MathLib.WAD, "Down")).toBe(0n);
    expect(MathLib.wDiv(1n, 3n * MathLib.WAD, "Up")).toBe(1n);
  });
  test("wDiv throws on zero divisor", () => {
    expect(() => MathLib.wDivDown(1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
  });
});

describe("MathLib.wTaylorCompounded", () => {
  test("returns 0 when n=0", () => {
    expect(MathLib.wTaylorCompounded(MathLib.WAD, 0n)).toBe(0n);
  });
  test("returns positive value for x>0, n>0", () => {
    const result = MathLib.wTaylorCompounded(MathLib.WAD / 100n, 1n);
    expect(result).toBeGreaterThan(0n);
  });
  test("first term dominates for small x*n", () => {
    // For tiny x, second/third terms vanish — first term ≈ x*n.
    const x = 1n;
    const n = 1n;
    expect(MathLib.wTaylorCompounded(x, n)).toBe(x * n);
  });
  test("monotonically increasing in n", () => {
    const x = MathLib.WAD / 1000n;
    const r1 = MathLib.wTaylorCompounded(x, 1n);
    const r2 = MathLib.wTaylorCompounded(x, 2n);
    expect(r2).toBeGreaterThan(r1);
  });
});

describe("MathLib.wToRay", () => {
  test("multiplies by 1e9 (WAD -> RAY)", () => {
    expect(MathLib.wToRay(MathLib.WAD)).toBe(MathLib.RAY);
  });
  test("preserves zero", () => {
    expect(MathLib.wToRay(0n)).toBe(0n);
  });
  test("scales arbitrary WAD values", () => {
    expect(MathLib.wToRay(5n * MathLib.WAD)).toBe(5n * MathLib.RAY);
  });
});

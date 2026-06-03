import { describe, expect, test } from "vitest";

import { MathLib } from "./math.js";

describe("MathLib constants", () => {
  test("default", () => {
    expect(MathLib.WAD).toBe(1_000_000_000_000_000_000n);
    expect(MathLib.RAY).toBe(1_000_000_000_000_000_000_000_000_000n);
    expect(MathLib.MAX_UINT_256).toBe(2n ** 256n - 1n);
    expect(MathLib.MAX_UINT_160).toBe(2n ** 160n - 1n);
    expect(MathLib.MAX_UINT_128).toBe(2n ** 128n - 1n);
    expect(MathLib.MAX_UINT_48).toBe(2n ** 48n - 1n);
  });
});

describe("MathLib.maxUint", () => {
  test("default", () => {
    expect(MathLib.maxUint(8)).toBe(2n ** 8n - 1n);
    expect(MathLib.maxUint(64)).toBe(2n ** 64n - 1n);
  });

  test("error: invalid bit length", () => {
    expect(() => MathLib.maxUint(7)).toThrow(/Invalid number of bits/);
    expect(() => MathLib.maxUint(33)).toThrow(/Invalid number of bits/);
  });

  test("behavior: nBits=0 keeps the previous BigInt boundary behavior", () => {
    expect(() => MathLib.maxUint(0)).toThrow(SyntaxError);
  });
});

describe("MathLib.abs", () => {
  test("default", () => {
    expect(MathLib.abs(5n)).toBe(5n);
    expect(MathLib.abs(-5n)).toBe(5n);
    expect(MathLib.abs(0n)).toBe(0n);
  });

  test("behavior: accepts bigint-compatible primitives", () => {
    expect(MathLib.abs("-42")).toBe(42n);
    expect(MathLib.abs(7)).toBe(7n);
  });
});

describe("MathLib.min / MathLib.max", () => {
  test("default", () => {
    expect(MathLib.min(2n, 5n)).toBe(2n);
    expect(MathLib.max(2n, 5n)).toBe(5n);
  });

  test("behavior: accepts variadic values", () => {
    expect(MathLib.min(3n, 1n, 4n, 1n, 5n, 9n, 2n, 6n)).toBe(1n);
    expect(MathLib.max(3n, 1n, 4n, 1n, 5n, 9n, 2n, 6n)).toBe(9n);
  });

  test("behavior: accepts mixed bigint-compatible inputs", () => {
    expect(MathLib.min(1, "2", 3n)).toBe(1n);
    expect(MathLib.max(1, "2", 3n)).toBe(3n);
  });
});

describe("MathLib.zeroFloorSub", () => {
  test("default", () => {
    expect(MathLib.zeroFloorSub(10n, 3n)).toBe(7n);
  });

  test("behavior: floors to zero when the subtraction would be negative", () => {
    expect(MathLib.zeroFloorSub(5n, 5n)).toBe(0n);
    expect(MathLib.zeroFloorSub(3n, 10n)).toBe(0n);
  });

  test("behavior: accepts bigint-compatible primitives", () => {
    expect(MathLib.zeroFloorSub("100", 30)).toBe(70n);
  });

  test("behavior: subtracts negative values without flooring", () => {
    expect(MathLib.zeroFloorSub(10n, -5n)).toBe(15n);
  });
});

describe("MathLib.mulDivDown / MathLib.mulDivUp", () => {
  test("default", () => {
    expect(MathLib.mulDivDown(7n, 3n, 2n)).toBe(10n);
    expect(MathLib.mulDivUp(7n, 3n, 2n)).toBe(11n);
  });

  test("behavior: both roundings match on exact division", () => {
    expect(MathLib.mulDivDown(6n, 1n, 3n)).toBe(2n);
    expect(MathLib.mulDivUp(6n, 1n, 3n)).toBe(2n);
  });

  test("error: division by zero", () => {
    expect(() => MathLib.mulDivDown(1n, 1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
    expect(() => MathLib.mulDivUp(1n, 1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
  });
});

describe("MathLib.mulDiv", () => {
  test("default", () => {
    expect(MathLib.mulDiv(7n, 3n, 2n, "Down")).toBe(10n);
    expect(MathLib.mulDiv(7n, 3n, 2n, "Up")).toBe(11n);
  });
});

describe("MathLib.wMul / MathLib.wMulDown / MathLib.wMulUp", () => {
  test("default", () => {
    expect(MathLib.wMulDown(MathLib.WAD, 42n)).toBe(42n);
  });

  test("behavior: multiplies two half-WAD values", () => {
    const half = MathLib.WAD / 2n;
    expect(MathLib.wMulDown(half, half)).toBe(MathLib.WAD / 4n);
  });

  test("behavior: rounds up when the remainder is non-zero", () => {
    expect(MathLib.wMulDown(1n, 1n)).toBe(0n);
    expect(MathLib.wMulUp(1n, 1n)).toBe(1n);
  });

  test("behavior: dispatches by rounding direction", () => {
    expect(MathLib.wMul(1n, 1n, "Down")).toBe(0n);
    expect(MathLib.wMul(1n, 1n, "Up")).toBe(1n);
  });
});

describe("MathLib.wDiv / MathLib.wDivDown / MathLib.wDivUp", () => {
  test("default", () => {
    expect(MathLib.wDivDown(42n, MathLib.WAD)).toBe(42n);
  });

  test("behavior: x divided by x equals WAD", () => {
    expect(MathLib.wDivDown(7n, 7n)).toBe(MathLib.WAD);
  });

  test("behavior: rounds up when the remainder is non-zero", () => {
    expect(MathLib.wDivDown(1n, 3n * MathLib.WAD)).toBe(0n);
    expect(MathLib.wDivUp(1n, 3n * MathLib.WAD)).toBe(1n);
  });

  test("behavior: dispatches by rounding direction", () => {
    expect(MathLib.wDiv(1n, 3n * MathLib.WAD, "Down")).toBe(0n);
    expect(MathLib.wDiv(1n, 3n * MathLib.WAD, "Up")).toBe(1n);
  });

  test("error: division by zero", () => {
    expect(() => MathLib.wDivDown(1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
  });
});

describe("MathLib.wTaylorCompounded", () => {
  test("default", () => {
    expect(MathLib.wTaylorCompounded(MathLib.WAD, 0n)).toBe(0n);
  });

  test("behavior: returns a positive value for positive inputs", () => {
    const result = MathLib.wTaylorCompounded(MathLib.WAD / 100n, 1n);
    expect(result).toBeGreaterThan(0n);
  });

  test("behavior: first term dominates for tiny x times n", () => {
    expect(MathLib.wTaylorCompounded(1n, 1n)).toBe(1n);
  });

  test("behavior: increases monotonically in n", () => {
    const x = MathLib.WAD / 1000n;
    const r1 = MathLib.wTaylorCompounded(x, 1n);
    const r2 = MathLib.wTaylorCompounded(x, 2n);
    expect(r2).toBeGreaterThan(r1);
  });
});

describe("MathLib.wToRay", () => {
  test("default", () => {
    expect(MathLib.wToRay(MathLib.WAD)).toBe(MathLib.RAY);
  });

  test("behavior: preserves zero", () => {
    expect(MathLib.wToRay(0n)).toBe(0n);
  });

  test("behavior: scales arbitrary WAD values", () => {
    expect(MathLib.wToRay(5n * MathLib.WAD)).toBe(5n * MathLib.RAY);
  });
});

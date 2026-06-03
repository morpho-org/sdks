import { describe, expect, test } from "vitest";

import { mulDivDown, mulDivUp, zeroFloorSub } from "./math.js";

describe("zeroFloorSub", () => {
  test("default", () => {
    expect(zeroFloorSub(10n, 3n)).toBe(7n);
  });

  test("behavior: floors to zero when the subtraction would be negative", () => {
    expect(zeroFloorSub(3n, 10n)).toBe(0n);
  });

  test("behavior: accepts bigint-compatible primitives", () => {
    expect(zeroFloorSub("100", 30)).toBe(70n);
  });
});

describe("mulDivDown", () => {
  test("default", () => {
    expect(mulDivDown(7n, 3n, 2n)).toBe(10n);
  });

  test("behavior: matches mulDivUp when the result is exact", () => {
    expect(mulDivDown(6n, 1n, 3n)).toBe(2n);
  });

  test("error: division by zero", () => {
    expect(() => mulDivDown(1n, 1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
  });
});

describe("mulDivUp", () => {
  test("default", () => {
    expect(mulDivUp(7n, 3n, 2n)).toBe(11n);
  });

  test("behavior: does not over-round when exact", () => {
    expect(mulDivUp(6n, 1n, 3n)).toBe(2n);
  });

  test("error: division by zero", () => {
    expect(() => mulDivUp(1n, 1n, 0n)).toThrow(/DIVISION_BY_ZERO/);
  });
});

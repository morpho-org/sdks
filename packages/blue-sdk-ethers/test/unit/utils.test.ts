import { safeParseNumber } from "../../src/index.js";

import { describe, expect, test } from "vitest";

describe("safeParseNumber", () => {
  test("should parse excessively small number", () => {
    expect(safeParseNumber(0.000000000000000000000000000000042, 18)).toEqual(
      0n,
    );
  });

  test("should parse excessively large number", () => {
    expect(
      safeParseNumber(4200000000000000000000000000000000000, 18).toString(),
    ).toEqual(
      4200000000000000000000000000000000000000000000000000000n.toString(),
    );
  });
});

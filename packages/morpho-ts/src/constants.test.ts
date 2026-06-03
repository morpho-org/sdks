import { describe, expect, test } from "vitest";

import { ORACLE_PRICE_SCALE, WAD } from "./constants.js";

describe("WAD", () => {
  test("default", () => {
    expect(WAD).toBe(10n ** 18n);
  });
});

describe("ORACLE_PRICE_SCALE", () => {
  test("default", () => {
    expect(ORACLE_PRICE_SCALE).toBe(10n ** 36n);
  });
});

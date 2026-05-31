import { describe, expect, test } from "vitest";
import { isMarketId } from "./types.js";

describe("isMarketId", () => {
  test("returns true for a 32-byte hex string", () => {
    expect(isMarketId(`0x${"ff".repeat(32)}`)).toBe(true);
  });

  test.each([
    undefined,
    1,
    "0x1234",
    "not-hex",
  ])("returns false for %s", (value) => {
    expect(isMarketId(value)).toBe(false);
  });
});

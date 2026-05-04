import { describe, expect, test } from "vitest";
import { formatLongString } from "./string.js";

describe("formatLongString", () => {
  test("returns the input unchanged when maxLength is undefined", () => {
    expect(formatLongString("hello world")).toBe("hello world");
  });

  test("returns the input unchanged when maxLength >= input length", () => {
    expect(formatLongString("hello", 5)).toBe("hello");
    expect(formatLongString("hello", 10)).toBe("hello");
  });

  test("returns '...' when maxLength <= 3", () => {
    expect(formatLongString("anything", 0)).toBe("...");
    expect(formatLongString("anything", 1)).toBe("...");
    expect(formatLongString("anything", 2)).toBe("...");
    expect(formatLongString("anything", 3)).toBe("...");
  });

  test("returns first char + '...' when maxLength === 4 (nChar === 1)", () => {
    expect(formatLongString("anything", 4)).toBe("a...");
    expect(formatLongString("morpho.org", 4)).toBe("m...");
  });

  test("splits and inserts '...' for longer maxLengths", () => {
    // maxLength=7 → nChar=4 → first 2 chars + "..." + last 2 chars
    expect(formatLongString("morpho.org", 7)).toBe("mo...rg");
  });

  test("works with maxLength=5 (nChar=2)", () => {
    // nChar=2 → first 1 char + "..." + last 1 char
    expect(formatLongString("morpho.org", 5)).toBe("m...g");
  });

  test("rounds nChar/2 when nChar is odd (maxLength=6)", () => {
    // nChar=3 → Math.round(3/2)=2 first chars + "..." + last 1.5 → "rg".slice(-1) = "g"
    const result = formatLongString("morpho.org", 6);
    expect(result.startsWith("mo...")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6 + 3);
  });

  test("handles empty string", () => {
    expect(formatLongString("", 5)).toBe("");
    expect(formatLongString("", 0)).toBe("");
  });

  test("handles single character", () => {
    expect(formatLongString("a", 5)).toBe("a");
    expect(formatLongString("a", 1)).toBe("a");
  });

  test("does not mutate the input", () => {
    const input = "hello";
    formatLongString(input, 4);
    expect(input).toBe("hello");
  });
});

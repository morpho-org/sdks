import { describe, expect, test } from "vitest";
import { formatEnumeration, formatUnion } from "./array.js";

describe("formatUnion", () => {
  test("returns empty string for empty list", () => {
    expect(formatUnion([])).toBe("");
  });

  test("returns the single element for one-item list", () => {
    expect(formatUnion(["a"])).toBe("a");
  });

  test("joins two items with ' or '", () => {
    expect(formatUnion(["a", "b"])).toBe("a or b");
  });

  test("joins three items with commas and ' or ' before the last", () => {
    expect(formatUnion(["a", "b", "c"])).toBe("a, b or c");
  });

  test("joins four items", () => {
    expect(formatUnion(["a", "b", "c", "d"])).toBe("a, b, c or d");
  });

  test("preserves whitespace inside items", () => {
    expect(formatUnion(["foo bar", "baz"])).toBe("foo bar or baz");
  });

  test("preserves empty-string items as-is", () => {
    expect(formatUnion(["", ""])).toBe(" or ");
  });

  test("does not mutate the input array", () => {
    const items = ["x", "y", "z"];
    const copy = [...items];
    formatUnion(items);
    expect(items).toEqual(copy);
  });
});

describe("formatEnumeration", () => {
  test("returns empty string for empty list", () => {
    expect(formatEnumeration([])).toBe("");
  });

  test("returns the single element for one-item list", () => {
    expect(formatEnumeration(["a"])).toBe("a");
  });

  test("joins two items with ' and '", () => {
    expect(formatEnumeration(["a", "b"])).toBe("a and b");
  });

  test("joins three items with commas and ' and ' before the last", () => {
    expect(formatEnumeration(["a", "b", "c"])).toBe("a, b and c");
  });

  test("joins four items", () => {
    expect(formatEnumeration(["a", "b", "c", "d"])).toBe("a, b, c and d");
  });

  test("does not mutate the input array", () => {
    const items = ["x", "y", "z"];
    const copy = [...items];
    formatEnumeration(items);
    expect(items).toEqual(copy);
  });
});

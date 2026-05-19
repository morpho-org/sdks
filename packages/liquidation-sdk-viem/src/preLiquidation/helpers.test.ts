import { describe, expect, test } from "vitest";
import { parseWithBigInt } from "./helpers.js";

describe("parseWithBigInt", () => {
  test("returns standard JSON values unchanged", () => {
    expect(parseWithBigInt('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  test("converts trailing-n strings to bigint", () => {
    expect(parseWithBigInt('{"v":"123n"}')).toEqual({ v: 123n });
  });

  test("handles negative bigint strings", () => {
    expect(parseWithBigInt('{"v":"-456n"}')).toEqual({ v: -456n });
  });

  test("handles bigints inside arrays", () => {
    expect(parseWithBigInt('[1,"2n",3]')).toEqual([1, 2n, 3]);
  });

  test("nests through objects", () => {
    expect(parseWithBigInt('{"a":{"b":"7n"}}')).toEqual({ a: { b: 7n } });
  });

  test("does not coerce strings that don't end in n", () => {
    expect(parseWithBigInt('{"v":"123"}')).toEqual({ v: "123" });
  });

  test("does not coerce strings with non-digit content before n", () => {
    expect(parseWithBigInt('{"v":"abcn"}')).toEqual({ v: "abcn" });
    expect(parseWithBigInt('{"v":"12.3n"}')).toEqual({ v: "12.3n" });
  });
});

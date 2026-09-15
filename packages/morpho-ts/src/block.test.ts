import { describe, expect, expectTypeOf, test } from "vitest";
import { type BlockNumberOrTag, toBlockParameters } from "./block.js";

describe("toBlockParameters", () => {
  test("default", () => {
    expect(toBlockParameters()).toStrictEqual({});
  });

  test.each([0n, 1n, 20_000_000n, 9_007_199_254_740_993n])(
    "behavior: preserves number %s without precision loss",
    (value) => {
      const block = Object.freeze({ type: "number", value } as const);
      expect(toBlockParameters(block)).toStrictEqual({ blockNumber: value });
      expect(block).toStrictEqual({ type: "number", value });
    },
  );

  test.each(["latest", "earliest", "pending", "safe", "finalized"] as const)(
    "behavior: converts tag %s",
    (value) => {
      const block = Object.freeze({ type: "tag", value } as const);
      expect(toBlockParameters(block)).toStrictEqual({ blockTag: value });
    },
  );

  test("behavior: type selects exactly one kind of block", () => {
    expectTypeOf<{
      type: "number";
      value: "latest";
    }>().not.toExtend<BlockNumberOrTag>();
    expectTypeOf<{
      type: "tag";
      value: bigint;
    }>().not.toExtend<BlockNumberOrTag>();
    expectTypeOf<{
      type: "tag";
      value: "unsupported";
    }>().not.toExtend<BlockNumberOrTag>();
    expectTypeOf<bigint>().not.toExtend<BlockNumberOrTag>();
  });
});

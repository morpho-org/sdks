import { parseAbi, parseUnits } from "viem";
import { describe, expect, test } from "vitest";
import {
  restructure,
  safeGetAddress,
  safeParseNumber,
  safeParseUnits,
} from "./utils.js";

describe("safeParseNumber", () => {
  test("parses an integer", () => {
    expect(safeParseNumber(1)).toBe(parseUnits("1", 18));
  });

  test("parses a decimal at default 18 decimals", () => {
    expect(safeParseNumber(1.5)).toBe(parseUnits("1.5", 18));
  });

  test("respects explicit decimals", () => {
    expect(safeParseNumber(1, 6)).toBe(parseUnits("1", 6));
    expect(safeParseNumber(1.5, 4)).toBe(parseUnits("1.5", 4));
  });

  test("avoids scientific notation for small values", () => {
    // 0.0000001 parsed at 8 decimals should yield 10
    expect(safeParseNumber(0.0000001, 8)).toBe(10n);
  });

  test("avoids scientific notation for large values", () => {
    expect(safeParseNumber(1e20, 0)).toBe(100_000_000_000_000_000_000n);
  });

  test("handles zero", () => {
    expect(safeParseNumber(0)).toBe(0n);
  });

  test("handles negatives", () => {
    expect(safeParseNumber(-1)).toBe(-parseUnits("1", 18));
  });
});

describe("safeParseUnits", () => {
  test("parses a normal decimal string", () => {
    expect(safeParseUnits("1.5", 18)).toBe(parseUnits("1.5", 18));
  });

  test("truncates extra fractional digits beyond decimals", () => {
    // "1.123456789" at decimals=4 -> "1.1234"
    expect(safeParseUnits("1.123456789", 4)).toBe(parseUnits("1.1234", 4));
  });

  test("handles whole numbers", () => {
    expect(safeParseUnits("42", 6)).toBe(parseUnits("42", 6));
  });

  test("treats leading dot as 0.x", () => {
    expect(safeParseUnits(".5", 4)).toBe(parseUnits("0.5", 4));
  });

  test("throws on completely invalid strings", () => {
    expect(() => safeParseUnits("abc")).toThrow(/invalid number/);
    expect(() => safeParseUnits("")).toThrow(/invalid number/);
  });

  test("handles negative numbers", () => {
    expect(safeParseUnits("-1.5", 18)).toBe(-parseUnits("1.5", 18));
  });
});

describe("safeGetAddress", () => {
  test("returns the EIP-55 checksum form for any input case", () => {
    expect(safeGetAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
    expect(safeGetAddress("0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48")).toBe(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
  });

  test("throws on a non-address string", () => {
    expect(() => safeGetAddress("0xnotanaddress")).toThrow();
  });
});

describe("restructure", () => {
  const namedAbi = parseAbi([
    "function getMarket() view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  ]);

  test("converts a positional tuple into an object using named ABI outputs", () => {
    const tuple = [1n, 2n, 3n, 4n, 5n, 6n] as const;
    const r = restructure(tuple, {
      abi: namedAbi,
      name: "getMarket",
      args: [],
    });
    expect(r).toEqual({
      totalSupplyAssets: 1n,
      totalSupplyShares: 2n,
      totalBorrowAssets: 3n,
      totalBorrowShares: 4n,
      lastUpdate: 5n,
      fee: 6n,
    });
  });

  test("throws when the function does not exist in the abi", () => {
    expect(() =>
      restructure([] as never, {
        abi: namedAbi,
        // @ts-expect-error - intentional bad input
        name: "doesNotExist",
        args: [],
      }),
    ).toThrow();
  });

  test("throws when ABI outputs lack names", () => {
    const unnamedAbi = parseAbi([
      "function foo() view returns (uint256, uint256)",
    ]);
    expect(() =>
      restructure([1n, 2n], { abi: unnamedAbi, name: "foo", args: [] }),
    ).toThrow(/lacking names/);
  });
});

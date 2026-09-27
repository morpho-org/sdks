import fc from "fast-check";
import { toBytes, toHex, keccak256 as viemKeccak256 } from "viem";
import { describe, expect, test } from "vitest";

import { keccak256, utf8ToBytes } from "./keccak.js";

const digest = (input: string) => toHex(keccak256(utf8ToBytes(input)));

describe("keccak256", () => {
  test("default: empty input", () => {
    expect(digest("")).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  test("behavior: known vector", () => {
    expect(digest("abc")).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });

  test("behavior: exactly one rate-sized block", () => {
    const input = new Uint8Array(136).fill(0xa5);

    expect(toHex(keccak256(input))).toBe(viemKeccak256(input));
  });

  test("behavior: multi-block input", () => {
    const input = new Uint8Array(300);
    for (let i = 0; i < input.length; i++) input[i] = i % 256;

    expect(toHex(keccak256(input))).toBe(viemKeccak256(input));
  });

  test("behavior: matches viem for arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (input) => {
        expect(toHex(keccak256(input))).toBe(viemKeccak256(input));
      }),
    );
  });
});

describe("utf8ToBytes", () => {
  test("default", () => {
    expect(utf8ToBytes("abc")).toEqual(toBytes("abc"));
  });
});

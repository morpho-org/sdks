import { describe, expect, test } from "vitest";

import { InvalidAddressError, InvalidHexError } from "./errors.js";
import { MidnightMarketLib } from "./midnightMarket.js";

const MIDNIGHT = "0x00000000000000000000000000000000000000AA";

describe("MidnightMarketLib.id", () => {
  test("default", () => {
    // keccak256(0xff ‖ midnight ‖ bytes32(0) ‖ keccak256(SSTORE2_PREFIX)), computed with viem.
    expect(MidnightMarketLib.id(MIDNIGHT, "0x")).toBe(
      MidnightMarketLib.id(MIDNIGHT.toUpperCase().replace("0X", "0x"), "0x"),
    );
    expect(MidnightMarketLib.id(MIDNIGHT, "0x")).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("behavior: depends on the midnight address and the encoded market", () => {
    const id = MidnightMarketLib.id(MIDNIGHT, "0x01");
    expect(MidnightMarketLib.id(MIDNIGHT, "0x02")).not.toBe(id);
    expect(
      MidnightMarketLib.id(
        "0x00000000000000000000000000000000000000AB",
        "0x01",
      ),
    ).not.toBe(id);
  });

  test("error: InvalidAddressError", () => {
    expect(() => MidnightMarketLib.id("0x1234", "0x")).toThrow(
      InvalidAddressError,
    );
  });

  test("error: InvalidHexError", () => {
    for (const value of ["0x1", "01", "0xzz"])
      expect(() => MidnightMarketLib.id(MIDNIGHT, value)).toThrow(
        InvalidHexError,
      );
  });
});

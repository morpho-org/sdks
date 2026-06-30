import type { Address } from "viem";
import {
  buildEcrecoverShimCode,
  ECRECOVER_PRECOMPILE_ADDRESS,
  ECRECOVER_RELOCATED_ADDRESS,
} from "./ecrecover-override.js";

describe("buildEcrecoverShimCode", () => {
  test("default: encodes PUSH20 <owner> MSTORE RETURN", () => {
    const owner: Address = "0x1111111111111111111111111111111111111111";
    expect(buildEcrecoverShimCode(owner)).toBe(
      "0x73111111111111111111111111111111111111111160005260206000f3",
    );
  });

  test("behavior: lowercases a checksummed owner", () => {
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    expect(buildEcrecoverShimCode(checksum)).toBe(
      `0x73${checksum.slice(2).toLowerCase()}60005260206000f3`,
    );
  });

  test("behavior: checksummed and lowercased inputs produce identical code", () => {
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase() as Address;
    expect(checksum).not.toBe(lower);
    expect(buildEcrecoverShimCode(checksum)).toBe(
      buildEcrecoverShimCode(lower),
    );
  });

  test("behavior: embeds exactly the 20-byte owner between fixed prefix and suffix", () => {
    const owner: Address = "0x2222222222222222222222222222222222222222";
    const code = buildEcrecoverShimCode(owner);
    expect(code.startsWith("0x73")).toBe(true);
    expect(code.endsWith("60005260206000f3")).toBe(true);
    // "0x" + "73" + 40 hex (20 bytes) + 16 hex (8 bytes) = 60 chars.
    expect(code).toHaveLength(60);
    expect(code.slice(4, 44)).toBe(owner.slice(2).toLowerCase());
  });

  test("behavior: distinct owners produce distinct code", () => {
    const a: Address = "0x1111111111111111111111111111111111111111";
    const b: Address = "0x2222222222222222222222222222222222222222";
    expect(buildEcrecoverShimCode(a)).not.toBe(buildEcrecoverShimCode(b));
  });

  test("error: throws on a malformed address", () => {
    expect(() => buildEcrecoverShimCode("0xnope" as Address)).toThrow();
  });
});

describe("ecrecover override constants", () => {
  test("default: precompile address is 0x…0001", () => {
    expect(ECRECOVER_PRECOMPILE_ADDRESS).toBe(
      "0x0000000000000000000000000000000000000001",
    );
  });

  test("default: relocated address is 0x…0ec1ec", () => {
    expect(ECRECOVER_RELOCATED_ADDRESS).toBe(
      "0x00000000000000000000000000000000000ec1ec",
    );
  });
});

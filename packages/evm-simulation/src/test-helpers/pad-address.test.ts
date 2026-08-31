import { padAddress } from "./pad-address.js";

describe("padAddress", () => {
  it("produces a 66-char 0x-prefixed hex string (32 bytes)", () => {
    const padded = padAddress("0x1234567890123456789012345678901234567890");
    expect(padded).toMatch(/^0x[0-9a-f]{64}$/);
    expect(padded.length).toBe(66);
  });

  it("right-aligns the address with 24 leading zero-bytes", () => {
    expect(padAddress("0x1234567890123456789012345678901234567890")).toBe(
      "0x0000000000000000000000001234567890123456789012345678901234567890",
    );
  });

  it("lowercases the address before padding", () => {
    expect(padAddress("0xaBcDef1234567890123456789012345678901234")).toBe(
      "0x000000000000000000000000abcdef1234567890123456789012345678901234",
    );
  });

  it("produces identical output for checksum vs lowercase input", () => {
    const checksum = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase();
    expect(padAddress(checksum)).toBe(padAddress(lower));
  });
});

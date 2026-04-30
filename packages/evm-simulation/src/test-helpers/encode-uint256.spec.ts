import { encodeUint256 } from "./encode-uint256.js";

describe("encodeUint256", () => {
  it("encodes 0 as all-zero 32-byte hex", () => {
    expect(encodeUint256(0n)).toBe(`0x${"0".repeat(64)}`);
  });

  it("encodes 1 with left-padded leading zeros", () => {
    expect(encodeUint256(1n)).toBe(`0x${"0".repeat(63)}1`);
  });

  it("encodes 1_000_000 (1 USDC) correctly", () => {
    expect(encodeUint256(1_000_000n)).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000f4240",
    );
  });

  it("encodes uint256 max without overflow", () => {
    const max = 2n ** 256n - 1n;
    expect(encodeUint256(max)).toBe(`0x${"f".repeat(64)}`);
  });

  it("always produces a 66-char 0x-prefixed hex string regardless of magnitude", () => {
    for (const v of [0n, 1n, 1_000_000n, 10n ** 18n, 2n ** 255n]) {
      const out = encodeUint256(v);
      expect(out).toMatch(/^0x[0-9a-f]{64}$/);
      expect(out.length).toBe(66);
    }
  });
});

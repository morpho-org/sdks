import { describe, expect, test } from "vitest";
import { VaultUtils } from "./VaultUtils.js";

describe("VaultUtils", () => {
  test("decimalsOffset floors at zero", () => {
    expect(VaultUtils.decimalsOffset(6n)).toBe(12n);
    expect(VaultUtils.decimalsOffset(18n)).toBe(0n);
    expect(VaultUtils.decimalsOffset(24n)).toBe(0n);
  });

  test("toAssets and toShares use virtual offsets and default rounding", () => {
    const vault = {
      totalAssets: 1_000n,
      totalSupply: 500n,
      decimalsOffset: 0n,
    };

    expect(VaultUtils.toAssets(1n, vault)).toBe(1n);
    expect(VaultUtils.toShares(1n, vault)).toBe(1n);
  });

  test("explicit rounding direction is honored", () => {
    const vault = { totalAssets: 2n, totalSupply: 1n, decimalsOffset: 0n };

    expect(VaultUtils.toAssets(1n, vault, "Down")).toBe(1n);
    expect(VaultUtils.toAssets(1n, vault, "Up")).toBe(2n);
    expect(VaultUtils.toShares(1n, vault, "Down")).toBe(0n);
    expect(VaultUtils.toShares(1n, vault, "Up")).toBe(1n);
  });
});

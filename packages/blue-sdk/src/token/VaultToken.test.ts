import { describe, expect, test } from "vitest";
import { vaultConfig } from "../__test__/fixtures.js";
import { VaultToken } from "./VaultToken.js";

describe("VaultToken", () => {
  test("constructor stores vault accounting fields", () => {
    const token = new VaultToken(vaultConfig({ decimalsOffset: 2n }), {
      totalAssets: 1_000n,
      totalSupply: 500n,
    });

    expect(token.asset).toBe(vaultConfig().asset);
    expect(token.decimalsOffset).toBe(2n);
    expect(token.totalAssets).toBe(1_000n);
    expect(token.totalSupply).toBe(500n);
  });

  test("wrap and unwrap use VaultUtils conversions", () => {
    const token = new VaultToken(vaultConfig(), {
      totalAssets: 1_000n,
      totalSupply: 500n,
    });

    expect(token.toWrappedExactAmountIn(101n)).toBe(50n);
    expect(token.toUnwrappedExactAmountIn(50n)).toBe(99n);
  });
});

// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount, total } from "../__test__/arbitraries.js";
import { vaultInput } from "../__test__/fixtures.js";
import { Vault } from "./Vault.js";
import { VaultUtils } from "./VaultUtils.js";

// MetaMorpho.sol: previewDeposit / previewMint / previewWithdraw rounding.
describe("Vault", () => {
  test.prop([amount, total, total, fc.bigInt({ min: 0n, max: 18n })], {
    numRuns: 1_000,
  })("default", (value, totalAssets, totalSupply, decimalsOffset) => {
    const vault = new Vault(
      vaultInput({ totalAssets, totalSupply, decimalsOffset }),
    );
    const totals = { totalAssets, totalSupply, decimalsOffset };

    expect(vault.toAssets(value)).toBe(
      VaultUtils.toAssets(value, totals, "Down"),
    );
    expect(vault.toShares(value)).toBe(
      VaultUtils.toShares(value, totals, "Up"),
    );
  });

  test.prop([amount, total, total, fc.bigInt({ min: 0n, max: 18n })], {
    numRuns: 1_000,
  })(
    "behavior: wrapped conversions use preview rounding",
    (value, totalAssets, totalSupply, decimalsOffset) => {
      const vault = new Vault(
        vaultInput({ totalAssets, totalSupply, decimalsOffset }),
      );
      const totals = { totalAssets, totalSupply, decimalsOffset };

      expect(vault.toWrappedExactAmountIn(value)).toBe(
        VaultUtils.toShares(value, totals, "Down"),
      );
      expect(vault.toUnwrappedExactAmountIn(value)).toBe(
        VaultUtils.toAssets(value, totals, "Down"),
      );
      expect(vault.toWrappedExactAmountOut(value)).toBe(
        VaultUtils.toAssets(value, totals, "Up"),
      );
      expect(vault.toUnwrappedExactAmountOut(value)).toBe(
        VaultUtils.toShares(value, totals, "Up"),
      );
    },
  );
});

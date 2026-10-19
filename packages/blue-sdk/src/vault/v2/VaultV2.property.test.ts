// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount, total } from "../../__test__/arbitraries.js";
import { vaultV2Input } from "../../__test__/fixtures.js";
import { MathLib } from "../../math/MathLib.js";
import { VaultV2 } from "./VaultV2.js";

const state = fc.record({
  totalAssets: total,
  totalSupply: total,
  virtualShares: fc.integer({ min: 0, max: 18 }).map((k) => 10n ** BigInt(k)),
});

// vault-v2/src/VaultV2.sol: previewDeposit/previewWithdraw; convertToShares delegates to previewDeposit.
describe("toShares", () => {
  test.prop([amount, state], { numRuns: 1_000 })(
    "default",
    (assets, totals) => {
      const vault = new VaultV2(
        vaultV2Input({
          _totalAssets: totals.totalAssets,
          totalSupply: totals.totalSupply,
          virtualShares: totals.virtualShares,
        }),
      );
      const denominator = totals.totalAssets + 1n;
      const numerator = assets * (totals.totalSupply + totals.virtualShares);

      expect(vault.toShares(assets)).toBe(numerator / denominator);
      expect(vault.toShares(assets, "Up")).toBe(
        (numerator + denominator - 1n) / denominator,
      );
    },
  );

  test.prop([amount, state], { numRuns: 1_000 })(
    "behavior: Up is at most one greater than Down, within uint256",
    (assets, totals) => {
      const vault = new VaultV2(
        vaultV2Input({
          _totalAssets: totals.totalAssets,
          totalSupply: totals.totalSupply,
          virtualShares: totals.virtualShares,
        }),
      );
      const down = vault.toShares(assets);
      const up = vault.toShares(assets, "Up");

      expect(up).toBeGreaterThanOrEqual(down);
      expect(up - down).toBeLessThanOrEqual(1n);
      for (const result of [
        down,
        up,
        vault.toAssets(assets),
        vault.toWrappedExactAmountOut(assets),
      ]) {
        expect(result).toBeGreaterThanOrEqual(0n);
        expect(result).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
      }
    },
  );

  test.prop([amount, amount, state], { numRuns: 1_000 })(
    "behavior: monotonic in the amount",
    (first, second, totals) => {
      const vault = new VaultV2(
        vaultV2Input({
          _totalAssets: totals.totalAssets,
          totalSupply: totals.totalSupply,
          virtualShares: totals.virtualShares,
        }),
      );
      const lower = first <= second ? first : second;
      const higher = first <= second ? second : first;

      expect(vault.toShares(lower)).toBeLessThanOrEqual(vault.toShares(higher));
      expect(vault.toShares(lower, "Up")).toBeLessThanOrEqual(
        vault.toShares(higher, "Up"),
      );
      expect(vault.toAssets(lower)).toBeLessThanOrEqual(vault.toAssets(higher));
      expect(vault.toWrappedExactAmountOut(lower)).toBeLessThanOrEqual(
        vault.toWrappedExactAmountOut(higher),
      );
    },
  );

  test.prop([amount, amount, state], { numRuns: 1_000 })(
    "behavior: preview relations",
    (assets, shares, totals) => {
      const vault = new VaultV2(
        vaultV2Input({
          _totalAssets: totals.totalAssets,
          totalSupply: totals.totalSupply,
          virtualShares: totals.virtualShares,
        }),
      );
      const previewDeposit = vault.toShares(assets);
      const previewMint = vault.toWrappedExactAmountOut(shares);
      const previewWithdraw = vault.toShares(assets, "Up");
      const previewRedeem = vault.toAssets(shares);

      // previewRedeem(previewDeposit(assets)) <= assets.
      expect(vault.toAssets(previewDeposit)).toBeLessThanOrEqual(assets);
      // previewMint(previewDeposit(assets)) <= assets.
      expect(vault.toWrappedExactAmountOut(previewDeposit)).toBeLessThanOrEqual(
        assets,
      );
      // previewWithdraw(previewRedeem(shares)) <= shares.
      expect(vault.toShares(previewRedeem, "Up")).toBeLessThanOrEqual(shares);
      // previewDeposit(previewMint(shares)) >= shares.
      expect(vault.toShares(previewMint)).toBeGreaterThanOrEqual(shares);
      // previewRedeem(previewWithdraw(assets)) >= assets.
      expect(vault.toAssets(previewWithdraw)).toBeGreaterThanOrEqual(assets);
    },
  );
});

// vault-v2/src/VaultV2.sol: previewMint.
describe("toWrappedExactAmountOut", () => {
  test.prop([amount, state], { numRuns: 1_000 })(
    "default",
    (shares, totals) => {
      const vault = new VaultV2(
        vaultV2Input({
          _totalAssets: totals.totalAssets,
          totalSupply: totals.totalSupply,
          virtualShares: totals.virtualShares,
        }),
      );
      const numerator = shares * (totals.totalAssets + 1n);
      const denominator = totals.totalSupply + totals.virtualShares;

      expect(vault.toWrappedExactAmountOut(shares)).toBe(
        (numerator + denominator - 1n) / denominator,
      );
    },
  );
});

// vault-v2/src/VaultV2.sol: previewRedeem; convertToAssets delegates to previewRedeem.
describe("toAssets", () => {
  test.prop([amount, state], { numRuns: 1_000 })(
    "default",
    (shares, totals) => {
      const vault = new VaultV2(
        vaultV2Input({
          _totalAssets: totals.totalAssets,
          totalSupply: totals.totalSupply,
          virtualShares: totals.virtualShares,
        }),
      );
      const denominator = totals.totalSupply + totals.virtualShares;
      const numerator = shares * (totals.totalAssets + 1n);

      expect(vault.toAssets(shares)).toBe(numerator / denominator);
    },
  );
});

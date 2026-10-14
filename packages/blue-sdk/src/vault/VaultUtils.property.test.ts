// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount, total } from "../__test__/arbitraries.js";
import { MathLib } from "../math/MathLib.js";
import { VaultUtils } from "./VaultUtils.js";

const state = fc.record({
  totalAssets: total,
  totalSupply: total,
  decimalsOffset: fc.bigInt({ min: 0n, max: 18n }),
});

// MetaMorpho.sol: DECIMALS_OFFSET = uint8(uint256(18).zeroFloorSub(decimals)).
describe("decimalsOffset", () => {
  test.prop([fc.bigInt({ min: 0n, max: 36n })], { numRuns: 1_000 })(
    "default",
    (decimals) => {
      expect(VaultUtils.decimalsOffset(decimals)).toBe(
        decimals >= 18n ? 0n : 18n - decimals,
      );
    },
  );
});

// MetaMorpho.sol _convertToSharesWithTotals; OZ ERC4626 previewDeposit (Down) / previewWithdraw (Up).
describe("toShares", () => {
  test.prop([amount, state], { numRuns: 1_000 })(
    "default",
    (assets, totals) => {
      const denominator = totals.totalAssets + 1n;
      const numerator =
        assets * (totals.totalSupply + 10n ** totals.decimalsOffset);

      expect(VaultUtils.toShares(assets, totals, "Down")).toBe(
        numerator / denominator,
      );
      expect(VaultUtils.toShares(assets, totals, "Up")).toBe(
        (numerator + denominator - 1n) / denominator,
      );
      expect(VaultUtils.toShares(assets, totals)).toBe(
        (numerator + denominator - 1n) / denominator,
      );
    },
  );

  test.prop([amount, state], { numRuns: 1_000 })(
    "behavior: Up is at most one greater than Down, within uint256",
    (assets, totals) => {
      const down = VaultUtils.toShares(assets, totals, "Down");
      const up = VaultUtils.toShares(assets, totals, "Up");

      expect(up).toBeGreaterThanOrEqual(down);
      expect(up - down).toBeLessThanOrEqual(1n);
      expect(down).toBeGreaterThanOrEqual(0n);
      expect(down).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
      expect(up).toBeGreaterThanOrEqual(0n);
      expect(up).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
    },
  );

  test.prop([amount, amount, state], { numRuns: 1_000 })(
    "behavior: monotonic in the amount",
    (first, second, totals) => {
      const lower = first <= second ? first : second;
      const higher = first <= second ? second : first;

      expect(VaultUtils.toShares(lower, totals, "Down")).toBeLessThanOrEqual(
        VaultUtils.toShares(higher, totals, "Down"),
      );
      expect(VaultUtils.toShares(lower, totals, "Up")).toBeLessThanOrEqual(
        VaultUtils.toShares(higher, totals, "Up"),
      );
    },
  );

  test.prop([amount, state], { numRuns: 1_000 })(
    "behavior: preview relations",
    (value, totals) => {
      // previewRedeem(previewDeposit(assets)) <= assets.
      expect(
        VaultUtils.toAssets(
          VaultUtils.toShares(value, totals, "Down"),
          totals,
          "Down",
        ),
      ).toBeLessThanOrEqual(value);
      // previewMint(previewDeposit(assets)) <= assets.
      expect(
        VaultUtils.toAssets(
          VaultUtils.toShares(value, totals, "Down"),
          totals,
          "Up",
        ),
      ).toBeLessThanOrEqual(value);
      // previewWithdraw(previewRedeem(shares)) <= shares.
      expect(
        VaultUtils.toShares(
          VaultUtils.toAssets(value, totals, "Down"),
          totals,
          "Up",
        ),
      ).toBeLessThanOrEqual(value);
      // previewDeposit(previewMint(shares)) >= shares.
      expect(
        VaultUtils.toShares(
          VaultUtils.toAssets(value, totals, "Up"),
          totals,
          "Down",
        ),
      ).toBeGreaterThanOrEqual(value);
      // previewRedeem(previewWithdraw(assets)) >= assets.
      expect(
        VaultUtils.toAssets(
          VaultUtils.toShares(value, totals, "Up"),
          totals,
          "Down",
        ),
      ).toBeGreaterThanOrEqual(value);
    },
  );
});

// MetaMorpho.sol _convertToAssetsWithTotals; previewRedeem (Down) / previewMint (Up).
describe("toAssets", () => {
  test.prop([amount, state], { numRuns: 1_000 })(
    "default",
    (shares, totals) => {
      const denominator = totals.totalSupply + 10n ** totals.decimalsOffset;
      const numerator = shares * (totals.totalAssets + 1n);

      expect(VaultUtils.toAssets(shares, totals, "Down")).toBe(
        numerator / denominator,
      );
      expect(VaultUtils.toAssets(shares, totals, "Up")).toBe(
        (numerator + denominator - 1n) / denominator,
      );
      expect(VaultUtils.toAssets(shares, totals)).toBe(numerator / denominator);
    },
  );

  test.prop([amount, state], { numRuns: 1_000 })(
    "behavior: Up is at most one greater than Down, within uint256",
    (shares, totals) => {
      const down = VaultUtils.toAssets(shares, totals, "Down");
      const up = VaultUtils.toAssets(shares, totals, "Up");

      expect(up).toBeGreaterThanOrEqual(down);
      expect(up - down).toBeLessThanOrEqual(1n);
      expect(down).toBeGreaterThanOrEqual(0n);
      expect(down).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
      expect(up).toBeGreaterThanOrEqual(0n);
      expect(up).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
    },
  );

  test.prop([amount, amount, state], { numRuns: 1_000 })(
    "behavior: monotonic in the amount",
    (first, second, totals) => {
      const lower = first <= second ? first : second;
      const higher = first <= second ? second : first;

      expect(VaultUtils.toAssets(lower, totals, "Down")).toBeLessThanOrEqual(
        VaultUtils.toAssets(higher, totals, "Down"),
      );
      expect(VaultUtils.toAssets(lower, totals, "Up")).toBeLessThanOrEqual(
        VaultUtils.toAssets(higher, totals, "Up"),
      );
    },
  );
});

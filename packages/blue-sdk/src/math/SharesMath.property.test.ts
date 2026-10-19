// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount, total, VIRTUAL_SHARES } from "../__test__/arbitraries.js";
import { MathLib } from "./MathLib.js";
import { SharesMath } from "./SharesMath.js";

// morpho-blue/src/libraries/SharesMathLib.sol: toAssetsDown and toAssetsUp.
describe("toAssets", () => {
  test.prop([amount, total, total], { numRuns: 1_000 })(
    "default",
    (shares, totalAssets, totalShares) => {
      const denominator = totalShares + VIRTUAL_SHARES;
      const numerator = shares * (totalAssets + 1n);

      expect(
        SharesMath.toAssets(shares, totalAssets, totalShares, "Down"),
      ).toBe(numerator / denominator);
      expect(SharesMath.toAssets(shares, totalAssets, totalShares, "Up")).toBe(
        (numerator + denominator - 1n) / denominator,
      );
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: Up is at most one greater than Down",
    (shares, totalAssets, totalShares) => {
      const down = SharesMath.toAssets(
        shares,
        totalAssets,
        totalShares,
        "Down",
      );
      const up = SharesMath.toAssets(shares, totalAssets, totalShares, "Up");

      expect(up).toBeGreaterThanOrEqual(down);
      expect(up - down).toBeLessThanOrEqual(1n);
    },
  );

  test.prop([amount, amount, total, total], { numRuns: 1_000 })(
    "behavior: monotonic in the amount",
    (first, second, totalAssets, totalShares) => {
      const lower = first <= second ? first : second;
      const higher = first <= second ? second : first;

      expect(
        SharesMath.toAssets(lower, totalAssets, totalShares, "Down"),
      ).toBeLessThanOrEqual(
        SharesMath.toAssets(higher, totalAssets, totalShares, "Down"),
      );
      expect(
        SharesMath.toAssets(lower, totalAssets, totalShares, "Up"),
      ).toBeLessThanOrEqual(
        SharesMath.toAssets(higher, totalAssets, totalShares, "Up"),
      );
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: result is a uint256",
    (shares, totalAssets, totalShares) => {
      for (const rounding of ["Down", "Up"] as const) {
        const result = SharesMath.toAssets(
          shares,
          totalAssets,
          totalShares,
          rounding,
        );
        expect(result).toBeGreaterThanOrEqual(0n);
        expect(result).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
      }
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: round trips preserve the rounding direction",
    (value, totalAssets, totalShares) => {
      const suppliedShares = SharesMath.toShares(
        value,
        totalAssets,
        totalShares,
        "Down",
      );
      expect(
        SharesMath.toAssets(suppliedShares, totalAssets, totalShares, "Down"),
      ).toBeLessThanOrEqual(value);

      const redeemedAssets = SharesMath.toAssets(
        value,
        totalAssets,
        totalShares,
        "Down",
      );
      expect(
        SharesMath.toShares(redeemedAssets, totalAssets, totalShares, "Down"),
      ).toBeLessThanOrEqual(value);

      const redeemedAssetsUp = SharesMath.toAssets(
        value,
        totalAssets,
        totalShares,
        "Up",
      );
      expect(
        SharesMath.toShares(redeemedAssetsUp, totalAssets, totalShares, "Up"),
      ).toBeGreaterThanOrEqual(value);

      const suppliedSharesUp = SharesMath.toShares(
        value,
        totalAssets,
        totalShares,
        "Up",
      );
      expect(
        SharesMath.toAssets(suppliedSharesUp, totalAssets, totalShares, "Up"),
      ).toBeGreaterThanOrEqual(value);
    },
  );
});

// morpho-blue/src/libraries/SharesMathLib.sol: toSharesDown and toSharesUp.
describe("toShares", () => {
  test.prop([amount, total, total], { numRuns: 1_000 })(
    "default",
    (assets, totalAssets, totalShares) => {
      const denominator = totalAssets + 1n;
      const numerator = assets * (totalShares + VIRTUAL_SHARES);

      expect(
        SharesMath.toShares(assets, totalAssets, totalShares, "Down"),
      ).toBe(numerator / denominator);
      expect(SharesMath.toShares(assets, totalAssets, totalShares, "Up")).toBe(
        (numerator + denominator - 1n) / denominator,
      );
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: Up is at most one greater than Down",
    (assets, totalAssets, totalShares) => {
      const down = SharesMath.toShares(
        assets,
        totalAssets,
        totalShares,
        "Down",
      );
      const up = SharesMath.toShares(assets, totalAssets, totalShares, "Up");

      expect(up).toBeGreaterThanOrEqual(down);
      expect(up - down).toBeLessThanOrEqual(1n);
    },
  );

  test.prop([amount, amount, total, total], { numRuns: 1_000 })(
    "behavior: monotonic in the amount",
    (first, second, totalAssets, totalShares) => {
      const lower = first <= second ? first : second;
      const higher = first <= second ? second : first;

      expect(
        SharesMath.toShares(lower, totalAssets, totalShares, "Down"),
      ).toBeLessThanOrEqual(
        SharesMath.toShares(higher, totalAssets, totalShares, "Down"),
      );
      expect(
        SharesMath.toShares(lower, totalAssets, totalShares, "Up"),
      ).toBeLessThanOrEqual(
        SharesMath.toShares(higher, totalAssets, totalShares, "Up"),
      );
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: result is a uint256",
    (assets, totalAssets, totalShares) => {
      for (const rounding of ["Down", "Up"] as const) {
        const result = SharesMath.toShares(
          assets,
          totalAssets,
          totalShares,
          rounding,
        );
        expect(result).toBeGreaterThanOrEqual(0n);
        expect(result).toBeLessThanOrEqual(MathLib.MAX_UINT_256);
      }
    },
  );
});

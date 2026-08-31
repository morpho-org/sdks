import { parseEther } from "viem";
import { describe, expect, test } from "vitest";
import { UnsupportedPreLiquidationParamsError } from "./errors.js";
import {
  defaultPreLiquidationParamsRegistry,
  getDefaultPreLiquidationParams,
} from "./preLiquidation.js";

describe("defaultPreLiquidationParamsRegistry", () => {
  test("contains the canonical Morpho LLTV tiers", () => {
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.385"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.625"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.77"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.86"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.915"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.945"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.965"))).toBe(
      true,
    );
    expect(defaultPreLiquidationParamsRegistry.has(parseEther("0.98"))).toBe(
      true,
    );
  });

  test("each entry has the five expected fields", () => {
    for (const [, params] of defaultPreLiquidationParamsRegistry) {
      expect(typeof params.preLltv).toBe("bigint");
      expect(typeof params.preLCF1).toBe("bigint");
      expect(typeof params.preLCF2).toBe("bigint");
      expect(typeof params.preLIF1).toBe("bigint");
      expect(typeof params.preLIF2).toBe("bigint");
    }
  });

  test("preLCF2 > preLCF1 (close-factor grows with proximity to liquidation)", () => {
    for (const [, p] of defaultPreLiquidationParamsRegistry) {
      expect(p.preLCF2).toBeGreaterThan(p.preLCF1);
    }
  });

  test("preLIF >= 1 WAD (incentive is non-negative)", () => {
    for (const [, p] of defaultPreLiquidationParamsRegistry) {
      expect(p.preLIF1).toBeGreaterThanOrEqual(parseEther("1"));
      expect(p.preLIF2).toBeGreaterThanOrEqual(parseEther("1"));
    }
  });

  test("preLltv is below the corresponding lltv key", () => {
    for (const [lltv, p] of defaultPreLiquidationParamsRegistry) {
      expect(p.preLltv).toBeLessThan(lltv);
    }
  });
});

describe("getDefaultPreLiquidationParams", () => {
  test("returns the registry entry for a known LLTV (bigint)", () => {
    const lltv = parseEther("0.86");
    const params = getDefaultPreLiquidationParams(lltv);
    expect(params).toBe(defaultPreLiquidationParamsRegistry.get(lltv));
  });

  test("accepts BigIntish (number) for known LLTV", () => {
    // parseEther("0.86") -> 860_000_000_000_000_000
    const lltv = 860000000000000000n;
    const params = getDefaultPreLiquidationParams(lltv);
    expect(params).toBeDefined();
  });

  test("throws UnsupportedPreLiquidationParamsError for unknown LLTV", () => {
    expect(() => getDefaultPreLiquidationParams(parseEther("0.5"))).toThrow(
      UnsupportedPreLiquidationParamsError,
    );
  });

  test("the thrown error preserves the lltv", () => {
    try {
      getDefaultPreLiquidationParams(parseEther("0.5"));
      expect.fail("expected to throw UnsupportedPreLiquidationParamsError");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedPreLiquidationParamsError);
      expect((e as UnsupportedPreLiquidationParamsError).lltv).toBe(
        parseEther("0.5"),
      );
    }
  });
});

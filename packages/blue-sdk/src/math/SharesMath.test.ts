import { describe, expect, test } from "vitest";
import { SharesMath } from "./SharesMath.js";

describe("SharesMath constants", () => {
  test("VIRTUAL_SHARES and VIRTUAL_ASSETS match Morpho's hardcoded values", () => {
    expect(SharesMath.VIRTUAL_SHARES).toBe(1_000_000n);
    expect(SharesMath.VIRTUAL_ASSETS).toBe(1n);
  });
});

describe("SharesMath.toAssets", () => {
  test("with empty pool, virtual offsets dominate (deposit denial-of-attack)", () => {
    // shares * (0+1) / (0+VIRTUAL_SHARES) = shares / VIRTUAL_SHARES (rounded)
    expect(SharesMath.toAssets(SharesMath.VIRTUAL_SHARES, 0n, 0n, "Down")).toBe(
      1n,
    );
    expect(SharesMath.toAssets(0n, 0n, 0n, "Down")).toBe(0n);
  });

  test("non-empty pool — proportional conversion", () => {
    // 10 shares of a pool with totalAssets=100, totalShares=1000 -> ~1 asset
    const r = SharesMath.toAssets(10n, 100n, 1000n, "Down");
    // (10 * 101) / 1_001_000 = 1010 / 1_001_000 = 0
    expect(r).toBe(0n);
  });

  test("rounding direction respected — Up vs Down", () => {
    const down = SharesMath.toAssets(1n, 1000n, 100n, "Down");
    const up = SharesMath.toAssets(1n, 1000n, 100n, "Up");
    expect(up).toBeGreaterThanOrEqual(down);
  });

  test("monotonic in shares", () => {
    const a = SharesMath.toAssets(100n, 1_000_000n, 100n, "Down");
    const b = SharesMath.toAssets(200n, 1_000_000n, 100n, "Down");
    expect(b).toBeGreaterThan(a);
  });
});

describe("SharesMath.toShares", () => {
  test("with empty pool, mints assets * VIRTUAL_SHARES initially", () => {
    expect(SharesMath.toShares(1n, 0n, 0n, "Down")).toBe(
      SharesMath.VIRTUAL_SHARES,
    );
  });

  test("returns 0 for 0 assets", () => {
    expect(SharesMath.toShares(0n, 100n, 1000n, "Down")).toBe(0n);
  });

  test("rounding direction respected — Up vs Down", () => {
    const down = SharesMath.toShares(1n, 100n, 1000n, "Down");
    const up = SharesMath.toShares(1n, 100n, 1000n, "Up");
    expect(up).toBeGreaterThanOrEqual(down);
  });

  test("monotonic in assets", () => {
    const a = SharesMath.toShares(100n, 1_000_000n, 100n, "Down");
    const b = SharesMath.toShares(200n, 1_000_000n, 100n, "Down");
    expect(b).toBeGreaterThan(a);
  });
});

describe("toAssets <-> toShares round-trip (with virtual offset bias)", () => {
  test("shares -> assets -> shares ≤ original (because each step rounds down)", () => {
    const shares = 10_000_000_000n;
    const totalAssets = 1_000_000n;
    const totalShares = 100_000_000_000n;
    const assets = SharesMath.toAssets(
      shares,
      totalAssets,
      totalShares,
      "Down",
    );
    const shares2 = SharesMath.toShares(
      assets,
      totalAssets,
      totalShares,
      "Down",
    );
    expect(shares2).toBeLessThanOrEqual(shares);
  });
});

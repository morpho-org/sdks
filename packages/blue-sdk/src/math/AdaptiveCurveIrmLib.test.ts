import { describe, expect, test } from "vitest";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MathLib } from "./MathLib.js";

const { wExp, getBorrowRate, getUtilizationAtBorrowRate, TARGET_UTILIZATION } =
  AdaptiveCurveIrmLib;

describe("AdaptiveCurveIrmLib.wExp", () => {
  test("returns 0 for very negative inputs (below LN_WEI_INT)", () => {
    expect(wExp(AdaptiveCurveIrmLib.LN_WEI_INT - 1n)).toBe(0n);
  });

  test("returns clipped upper value for inputs at/above WEXP_UPPER_BOUND", () => {
    expect(wExp(AdaptiveCurveIrmLib.WEXP_UPPER_BOUND)).toBe(
      AdaptiveCurveIrmLib.WEXP_UPPER_VALUE,
    );
    expect(wExp(AdaptiveCurveIrmLib.WEXP_UPPER_BOUND + 1n)).toBe(
      AdaptiveCurveIrmLib.WEXP_UPPER_VALUE,
    );
  });

  test("wExp(0) ≈ 1 WAD", () => {
    expect(wExp(0n)).toBe(MathLib.WAD);
  });

  test("wExp(LN_2_INT) ≈ 2 WAD (within trivial Taylor error)", () => {
    const result = wExp(AdaptiveCurveIrmLib.LN_2_INT);
    // 2nd-order Taylor at r=0 — close to but not exactly 2 WAD.
    expect(result).toBe(2n * MathLib.WAD);
  });

  test("monotonically increasing within the valid domain", () => {
    expect(wExp(MathLib.WAD / 10n)).toBeGreaterThan(wExp(0n));
    expect(wExp(MathLib.WAD)).toBeGreaterThan(wExp(MathLib.WAD / 10n));
  });

  test("wExp(-x) < WAD for x>0", () => {
    expect(wExp(-MathLib.WAD / 10n)).toBeLessThan(MathLib.WAD);
  });
});

describe("AdaptiveCurveIrmLib.getBorrowRate (first interaction, startRateAtTarget=0)", () => {
  test("returns INITIAL_RATE_AT_TARGET-based rates regardless of utilization", () => {
    const r = getBorrowRate(TARGET_UTILIZATION, 0n, 0n);
    // err = 0 -> avg/end borrow rate equals avgRateAtTarget=INITIAL_RATE_AT_TARGET
    expect(r.endRateAtTarget).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
    expect(r.avgBorrowRate).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
  });

  test("at zero utilization, err < 0 -> coeff applies the slow side of the curve", () => {
    const r = getBorrowRate(0n, 0n, 0n);
    // Same INITIAL_RATE_AT_TARGET endRateAtTarget; endBorrowRate < endRateAtTarget.
    expect(r.endRateAtTarget).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
    expect(r.endBorrowRate).toBeLessThan(r.endRateAtTarget);
  });

  test("at full utilization, err > 0 -> coeff applies the fast side of the curve", () => {
    const r = getBorrowRate(MathLib.WAD, 0n, 0n);
    expect(r.endRateAtTarget).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
    expect(r.endBorrowRate).toBeGreaterThan(r.endRateAtTarget);
  });
});

describe("AdaptiveCurveIrmLib.getBorrowRate (subsequent interaction)", () => {
  test("zero elapsed time -> rate unchanged", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const r = getBorrowRate(MathLib.WAD, startRate, 0n);
    expect(r.endRateAtTarget).toBe(startRate);
  });

  test("positive elapsed time at high utilization grows endRateAtTarget toward MAX", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    // Long elapsed time at full utilization should push rate up.
    const r = getBorrowRate(MathLib.WAD, startRate, 30n * 24n * 3600n);
    expect(r.endRateAtTarget).toBeGreaterThan(startRate);
    expect(r.endRateAtTarget).toBeLessThanOrEqual(
      AdaptiveCurveIrmLib.MAX_RATE_AT_TARGET,
    );
  });

  test("positive elapsed time at zero utilization shrinks endRateAtTarget toward MIN", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const r = getBorrowRate(0n, startRate, 30n * 24n * 3600n);
    expect(r.endRateAtTarget).toBeLessThan(startRate);
    expect(r.endRateAtTarget).toBeGreaterThanOrEqual(
      AdaptiveCurveIrmLib.MIN_RATE_AT_TARGET,
    );
  });

  test("returned avgBorrowRate sits between start and end borrow rates", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const elapsed = 24n * 3600n;
    const r = getBorrowRate(MathLib.WAD, startRate, elapsed);
    expect(r.avgBorrowRate).toBeGreaterThan(0n);
    // The avg must be <= end (rate increases over time at high U).
    expect(r.avgBorrowRate).toBeLessThanOrEqual(r.endBorrowRate);
  });
});

describe("AdaptiveCurveIrmLib.getUtilizationAtBorrowRate", () => {
  test("when borrowRate === rateAtTarget, returns TARGET_UTILIZATION", () => {
    const u = getUtilizationAtBorrowRate(MathLib.WAD, MathLib.WAD);
    expect(u).toBe(TARGET_UTILIZATION);
  });

  test("at the maxBorrowRate (4x rateAtTarget), returns 1 WAD", () => {
    const rate = MathLib.WAD;
    const max = rate * 4n;
    expect(getUtilizationAtBorrowRate(max, rate)).toBe(MathLib.WAD);
  });

  test("at minBorrowRate (rate/4), returns 0", () => {
    const rate = MathLib.WAD;
    const min = rate / 4n;
    expect(getUtilizationAtBorrowRate(min, rate)).toBe(0n);
  });

  test("monotonically increasing in borrowRate", () => {
    const rate = MathLib.WAD;
    const u1 = getUtilizationAtBorrowRate(rate / 2n, rate);
    const u2 = getUtilizationAtBorrowRate(rate, rate);
    const u3 = getUtilizationAtBorrowRate(rate * 2n, rate);
    expect(u1).toBeLessThan(u2);
    expect(u2).toBeLessThan(u3);
  });

  test("clamps to 0 below the minBorrowRate", () => {
    const rate = MathLib.WAD;
    expect(getUtilizationAtBorrowRate(0n, rate)).toBe(0n);
    expect(getUtilizationAtBorrowRate(rate / 8n, rate)).toBe(0n);
  });

  test("clamps to 1 WAD above the maxBorrowRate", () => {
    const rate = MathLib.WAD;
    const max = rate * 4n;
    expect(getUtilizationAtBorrowRate(max + 1n, rate)).toBe(MathLib.WAD);
    expect(getUtilizationAtBorrowRate(max * 10n, rate)).toBe(MathLib.WAD);
  });
});

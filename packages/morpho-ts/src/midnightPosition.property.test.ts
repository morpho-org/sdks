import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { MathLib } from "./math.js";
import { MidnightPositionLib } from "./midnightPosition.js";

const U128 = MathLib.MAX_UINT_128;
const time = fc.bigInt({ min: 0n, max: 1_000_000n });
const inputs = fc
  .tuple(
    fc.bigInt({ min: 0n, max: U128 }),
    fc.bigInt({ min: 0n, max: U128 }),
    fc.bigInt({ min: 0n, max: U128 }),
    fc.bigInt({ min: 0n, max: U128 }),
    time,
    time,
    fc.bigInt({ min: 0n, max: 1_000_000n }),
  )
  .map(
    ([
      credit,
      pendingFeeSeed,
      lastLossFactor,
      marketLossFactorSeed,
      lastAccrual,
      maturity,
      elapsed,
    ]) => ({
      credit,
      pendingFee: pendingFeeSeed % (credit + 1n),
      lastLossFactor,
      lastAccrual,
      marketLossFactor:
        lastLossFactor + (marketLossFactorSeed % (U128 - lastLossFactor + 1n)),
      maturity,
      timestamp: lastAccrual + elapsed,
    }),
  );

describe("MidnightPositionLib properties", () => {
  test.prop([inputs], { numRuns: 1_000 })(
    "behavior: accrual outputs do not exceed their inputs",
    (params) => {
      const accrued = MidnightPositionLib.accrue(params);

      expect(accrued.credit).toBeLessThanOrEqual(params.credit);
      expect(accrued.pendingFee).toBeLessThanOrEqual(params.pendingFee);
      expect(accrued.accruedFee).toBeLessThanOrEqual(params.pendingFee);
      expect(accrued.credit).toBeGreaterThanOrEqual(0n);
      expect(accrued.pendingFee).toBeGreaterThanOrEqual(0n);
      expect(accrued.credit - accrued.pendingFee).toBeGreaterThanOrEqual(0n);
    },
  );

  test.prop([inputs, fc.bigInt({ min: 0n, max: 1_000_000n })], {
    numRuns: 1_000,
  })("behavior: net credit does not depend on timestamp", (params, elapsed) => {
    const later = {
      ...params,
      timestamp: params.timestamp + elapsed,
    };

    expect(MidnightPositionLib.netCredit(later)).toBe(
      MidnightPositionLib.netCredit(params),
    );
  });

  test.prop([inputs, fc.bigInt({ min: 0n, max: 1_000_000n })], {
    numRuns: 1_000,
  })(
    "behavior: splitting accrual in two steps undercharges the fee by at most 1",
    (params, split) => {
      const midpoint =
        params.lastAccrual +
        (split % (params.timestamp - params.lastAccrual + 1n));
      const single = MidnightPositionLib.accrue(params);
      const first = MidnightPositionLib.accrue({
        ...params,
        timestamp: midpoint,
      });
      const second = MidnightPositionLib.accrue({
        ...params,
        credit: first.credit,
        pendingFee: first.pendingFee,
        lastLossFactor: params.marketLossFactor,
        lastAccrual: midpoint,
      });
      const splitFee = first.accruedFee + second.accruedFee;

      expect(splitFee).toBeLessThanOrEqual(single.accruedFee);
      expect(splitFee).toBeGreaterThanOrEqual(single.accruedFee - 1n);
      expect(second.credit - second.pendingFee).toBe(
        single.credit - single.pendingFee,
      );
    },
  );

  test.prop([inputs], { numRuns: 1_000 })(
    "behavior: fee remains zero when pending fee is zero",
    (params) => {
      expect(
        MidnightPositionLib.accrue({ ...params, pendingFee: 0n }).accruedFee,
      ).toBe(0n);
    },
  );
});

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  ADJUSTMENT_SPEED,
  borrowRateRef,
  CURVE_STEEPNESS,
  INITIAL_RATE_AT_TARGET,
  LN_2_INT,
  LN_WEI_INT,
  MAX_RATE_AT_TARGET,
  MIN_RATE_AT_TARGET,
  SECONDS_PER_YEAR,
  TARGET_UTILIZATION,
  WAD,
  WEXP_UPPER_BOUND,
  WEXP_UPPER_VALUE,
  wExpRef,
} from "../__test__/adaptiveCurveIrmReference.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MathLib } from "./MathLib.js";

const xArb = fc.oneof(
  fc.constantFrom(
    0n,
    1n,
    -1n,
    LN_WEI_INT,
    LN_WEI_INT - 1n,
    WEXP_UPPER_BOUND,
    WEXP_UPPER_BOUND - 1n,
    LN_2_INT / 2n,
    -(LN_2_INT / 2n),
    LN_2_INT,
    -LN_2_INT,
  ),
  fc.bigInt({
    min: LN_WEI_INT - WAD,
    max: WEXP_UPPER_BOUND + WAD,
  }),
);
const utilizationArb = fc.oneof(
  fc.constantFrom(
    0n,
    1n,
    TARGET_UTILIZATION - 1n,
    TARGET_UTILIZATION,
    TARGET_UTILIZATION + 1n,
    WAD,
  ),
  fc.bigInt({ min: 0n, max: WAD }),
);
const startRateArb = fc.oneof(
  fc.constantFrom(
    0n,
    MIN_RATE_AT_TARGET,
    MAX_RATE_AT_TARGET,
    INITIAL_RATE_AT_TARGET,
  ),
  fc.bigInt({ min: MIN_RATE_AT_TARGET, max: MAX_RATE_AT_TARGET }),
);
const nonzeroStartRateArb = fc.oneof(
  fc.constantFrom(
    MIN_RATE_AT_TARGET,
    MAX_RATE_AT_TARGET,
    INITIAL_RATE_AT_TARGET,
  ),
  fc.bigInt({ min: MIN_RATE_AT_TARGET, max: MAX_RATE_AT_TARGET }),
);
const elapsedArb = fc.oneof(
  fc.constantFrom(0n, 1n, 12n, SECONDS_PER_YEAR),
  fc.bigInt({ min: 0n, max: 10n * SECONDS_PER_YEAR }),
);
const borrowRateInputArb = fc.record({
  utilization: utilizationArb,
  startRateAtTarget: startRateArb,
  elapsed: elapsedArb,
});
const utilizationMonotonicityInputArb = fc.record({
  utilizations: fc.tuple(utilizationArb, utilizationArb),
  startRateAtTarget: nonzeroStartRateArb,
  elapsed: elapsedArb,
});

// morpho-blue-irm src/adaptive-curve-irm/libraries/ExpLib.sol wExp
describe("wExp", () => {
  test.prop([xArb], { numRuns: 1_000 })("default", (x) => {
    expect(AdaptiveCurveIrmLib.wExp(x)).toBe(wExpRef(x));
  });

  test("constants match Solidity", () => {
    expect(MathLib.WAD).toBe(WAD);
    expect(AdaptiveCurveIrmLib.CURVE_STEEPNESS).toBe(CURVE_STEEPNESS);
    expect(AdaptiveCurveIrmLib.ADJUSTMENT_SPEED).toBe(ADJUSTMENT_SPEED);
    expect(AdaptiveCurveIrmLib.TARGET_UTILIZATION).toBe(TARGET_UTILIZATION);
    expect(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET).toBe(
      INITIAL_RATE_AT_TARGET,
    );
    expect(AdaptiveCurveIrmLib.MIN_RATE_AT_TARGET).toBe(MIN_RATE_AT_TARGET);
    expect(AdaptiveCurveIrmLib.MAX_RATE_AT_TARGET).toBe(MAX_RATE_AT_TARGET);
    expect(AdaptiveCurveIrmLib.LN_2_INT).toBe(LN_2_INT);
    expect(AdaptiveCurveIrmLib.LN_WEI_INT).toBe(LN_WEI_INT);
    expect(AdaptiveCurveIrmLib.WEXP_UPPER_BOUND).toBe(WEXP_UPPER_BOUND);
    expect(AdaptiveCurveIrmLib.WEXP_UPPER_VALUE).toBe(WEXP_UPPER_VALUE);
  });

  test("behavior: clamps below and above the supported range", () => {
    expect(AdaptiveCurveIrmLib.wExp(LN_WEI_INT - 1n)).toBe(0n);
    expect(AdaptiveCurveIrmLib.wExp(WEXP_UPPER_BOUND)).toBe(WEXP_UPPER_VALUE);
  });

  test("behavior: wExp(0) equals WAD", () => {
    expect(AdaptiveCurveIrmLib.wExp(0n)).toBe(WAD);
  });

  test.prop([xArb, xArb], { numRuns: 1_000 })(
    "behavior: non-decreasing in x",
    (first, second) => {
      const [x1, x2] = first <= second ? [first, second] : [second, first];

      expect(AdaptiveCurveIrmLib.wExp(x1)).toBeLessThanOrEqual(
        AdaptiveCurveIrmLib.wExp(x2),
      );
    },
  );
});

// morpho-blue-irm src/adaptive-curve-irm/AdaptiveCurveIrm.sol _borrowRate, _curve, _newRateAtTarget
describe("getBorrowRate", () => {
  test.prop([borrowRateInputArb], { numRuns: 1_000 })(
    "default",
    ({ utilization, startRateAtTarget, elapsed }) => {
      expect(
        AdaptiveCurveIrmLib.getBorrowRate(
          utilization,
          startRateAtTarget,
          elapsed,
        ),
      ).toStrictEqual(
        borrowRateRef({ utilization, startRateAtTarget, elapsed }),
      );
    },
  );

  test.prop([borrowRateInputArb], { numRuns: 1_000 })(
    "behavior: endRateAtTarget stays within bounds",
    ({ utilization, startRateAtTarget, elapsed }) => {
      const { endRateAtTarget } = AdaptiveCurveIrmLib.getBorrowRate(
        utilization,
        startRateAtTarget,
        elapsed,
      );

      if (startRateAtTarget === 0n) {
        expect(endRateAtTarget).toBe(INITIAL_RATE_AT_TARGET);
      } else {
        expect(endRateAtTarget).toBeGreaterThanOrEqual(MIN_RATE_AT_TARGET);
        expect(endRateAtTarget).toBeLessThanOrEqual(MAX_RATE_AT_TARGET);
      }
    },
  );

  test.prop([borrowRateInputArb], { numRuns: 1_000 })(
    "behavior: borrow rates stay within curve bounds",
    ({ utilization, startRateAtTarget, elapsed }) => {
      const { avgBorrowRate, endBorrowRate } =
        AdaptiveCurveIrmLib.getBorrowRate(
          utilization,
          startRateAtTarget,
          elapsed,
        );

      expect(avgBorrowRate).toBeGreaterThanOrEqual(MIN_RATE_AT_TARGET / 4n);
      expect(avgBorrowRate).toBeLessThanOrEqual(4n * MAX_RATE_AT_TARGET);
      expect(endBorrowRate).toBeGreaterThanOrEqual(MIN_RATE_AT_TARGET / 4n);
      expect(endBorrowRate).toBeLessThanOrEqual(4n * MAX_RATE_AT_TARGET);
    },
  );

  test.prop([utilizationMonotonicityInputArb], { numRuns: 1_000 })(
    "behavior: non-decreasing in utilization",
    ({ utilizations, startRateAtTarget, elapsed }) => {
      const [u1, u2] =
        utilizations[0] <= utilizations[1]
          ? utilizations
          : [utilizations[1], utilizations[0]];
      const first = AdaptiveCurveIrmLib.getBorrowRate(
        u1,
        startRateAtTarget,
        elapsed,
      );
      const second = AdaptiveCurveIrmLib.getBorrowRate(
        u2,
        startRateAtTarget,
        elapsed,
      );

      expect(first.avgBorrowRate).toBeLessThanOrEqual(second.avgBorrowRate);
      expect(first.endBorrowRate).toBeLessThanOrEqual(second.endBorrowRate);
      expect(first.endRateAtTarget).toBeLessThanOrEqual(second.endRateAtTarget);
    },
  );

  test.prop([utilizationArb, nonzeroStartRateArb], { numRuns: 1_000 })(
    "behavior: elapsed 0 preserves the rate at target",
    (utilization, startRateAtTarget) => {
      const result = AdaptiveCurveIrmLib.getBorrowRate(
        utilization,
        startRateAtTarget,
        0n,
      );

      expect(result.endRateAtTarget).toBe(startRateAtTarget);
      expect(result.avgBorrowRate).toBe(result.endBorrowRate);
    },
  );

  test.prop([nonzeroStartRateArb, elapsedArb], { numRuns: 1_000 })(
    "behavior: target utilization preserves the rate at target",
    (startRateAtTarget, elapsed) => {
      const result = AdaptiveCurveIrmLib.getBorrowRate(
        TARGET_UTILIZATION,
        startRateAtTarget,
        elapsed,
      );

      expect(result.endRateAtTarget).toBe(startRateAtTarget);
      expect(result.endBorrowRate).toBe(startRateAtTarget);
    },
  );
});

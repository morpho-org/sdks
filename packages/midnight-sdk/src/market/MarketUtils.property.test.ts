import { fc, test } from "@fast-check/vitest";
import { MathLib } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";

import { CBP } from "../constants.js";
import type { SettlementFeeCbps } from "./Market.js";
import { MarketUtils } from "./MarketUtils.js";

const WAD = MathLib.WAD;
const DAY = 86_400n;

// Midnight src/Midnight.sol settlementFee breakpoints.
const BREAKPOINTS = [0n, 1n, 7n, 30n, 90n, 180n, 360n].map((d) => d * DAY);

const refSettlementFee = (
  cbps: SettlementFeeCbps,
  timeToMaturity: bigint,
): bigint => {
  const fees = cbps.map((cbp) => BigInt(cbp) * CBP);
  if (timeToMaturity >= BREAKPOINTS[6]!) return fees[6]!;

  const [start, end, feeLower, feeUpper] =
    timeToMaturity < BREAKPOINTS[1]!
      ? ([BREAKPOINTS[0], BREAKPOINTS[1], fees[0], fees[1]] as const)
      : timeToMaturity < BREAKPOINTS[2]!
        ? ([BREAKPOINTS[1], BREAKPOINTS[2], fees[1], fees[2]] as const)
        : timeToMaturity < BREAKPOINTS[3]!
          ? ([BREAKPOINTS[2], BREAKPOINTS[3], fees[2], fees[3]] as const)
          : timeToMaturity < BREAKPOINTS[4]!
            ? ([BREAKPOINTS[3], BREAKPOINTS[4], fees[3], fees[4]] as const)
            : timeToMaturity < BREAKPOINTS[5]!
              ? ([BREAKPOINTS[4], BREAKPOINTS[5], fees[4], fees[5]] as const)
              : ([BREAKPOINTS[5], BREAKPOINTS[6], fees[5], fees[6]] as const);

  return (
    (feeLower * (end - timeToMaturity) + feeUpper * (timeToMaturity - start)) /
    (end - start)
  );
};

const refAdjacentFees = (cbps: SettlementFeeCbps, timeToMaturity: bigint) => {
  const fees = cbps.map((cbp) => BigInt(cbp) * CBP);
  if (timeToMaturity >= BREAKPOINTS[6]!) return [fees[6]!, fees[6]!] as const;

  for (let i = 1; i <= 6; i += 1) {
    if (timeToMaturity < BREAKPOINTS[i]!) {
      return [fees[i - 1]!, fees[i]!] as const;
    }
  }
  throw new Error("unreachable");
};

// Midnight src/libraries/ConstantsLib.sol maxLif.
const refLif = (lltv: bigint, cursor: bigint) =>
  mulDivDownRef(WAD, WAD, WAD - mulDivDownRef(cursor, WAD - lltv, WAD));

// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
const mulDivDownRef = (x: bigint, y: bigint, d: bigint) => (x * y) / d;

const cbpsArb: fc.Arbitrary<SettlementFeeCbps> = fc.tuple(
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
);

const ttmEdges = BREAKPOINTS.flatMap((breakpoint) => [
  breakpoint === 0n ? 0n : breakpoint - 1n,
  breakpoint,
  breakpoint + 1n,
]);
const ttmArb = fc.oneof(
  fc.constantFrom(...ttmEdges),
  fc.bigInt({ min: 0n, max: 2n * 360n * DAY }),
);

const lltvArb = fc.oneof(
  fc.constantFrom(1n, WAD - 1n, WAD),
  fc.bigInt({ min: 1n, max: WAD }),
);
const cursorArb = fc.oneof(
  fc.constantFrom(0n, WAD - 1n),
  fc.bigInt({ min: 0n, max: WAD - 1n }),
);

// Midnight src/Midnight.sol settlementFee
describe("MarketUtils.getSettlementFee", () => {
  test("default", () => {
    const cbps: SettlementFeeCbps = [1, 2, 3, 4, 5, 6, 7];

    // At each breakpoint the fee equals that bucket's cbp scaled by CBP.
    for (const [i, breakpoint] of BREAKPOINTS.entries()) {
      expect(
        MarketUtils.getSettlementFee({
          settlementFeeCbps: cbps,
          timeToMaturity: breakpoint,
        }),
      ).toBe(BigInt(cbps[i]!) * CBP);
    }
  });

  test.prop([cbpsArb, ttmArb], { numRuns: 1000 })(
    "behavior: equals the Solidity settlementFee port, bounded by adjacent buckets",
    (settlementFeeCbps, timeToMaturity) => {
      const fee = MarketUtils.getSettlementFee({
        settlementFeeCbps,
        timeToMaturity,
      });

      expect(fee).toBe(refSettlementFee(settlementFeeCbps, timeToMaturity));

      const [lower, upper] = refAdjacentFees(settlementFeeCbps, timeToMaturity);
      expect(fee).toBeGreaterThanOrEqual(lower < upper ? lower : upper);
      expect(fee).toBeLessThanOrEqual(lower < upper ? upper : lower);
    },
  );

  test.prop([fc.record({ cbps: cbpsArb, a: ttmArb, b: ttmArb })], {
    numRuns: 1000,
  })(
    "behavior: non-decreasing in time to maturity when cbp buckets are sorted",
    ({ cbps, a, b }) => {
      const s = [...cbps].sort((x, y) => x - y);
      const sorted: SettlementFeeCbps = [
        s[0]!,
        s[1]!,
        s[2]!,
        s[3]!,
        s[4]!,
        s[5]!,
        s[6]!,
      ];
      const [t1, t2] = a <= b ? [a, b] : [b, a];

      expect(
        MarketUtils.getSettlementFee({
          settlementFeeCbps: sorted,
          timeToMaturity: t1,
        }),
      ).toBeLessThanOrEqual(
        MarketUtils.getSettlementFee({
          settlementFeeCbps: sorted,
          timeToMaturity: t2,
        }),
      );
    },
  );
});

// Midnight src/libraries/ConstantsLib.sol maxLif
describe("MarketUtils.getLiquidationIncentiveFactor", () => {
  test("default", () => {
    expect(
      MarketUtils.getLiquidationIncentiveFactor(
        770_000_000_000_000_000n,
        250_000_000_000_000_000n,
      ),
    ).toBe(refLif(770_000_000_000_000_000n, 250_000_000_000_000_000n));
  });

  test.prop([lltvArb, cursorArb], { numRuns: 1000 })(
    "behavior: equals the Solidity maxLif port in both input forms, at least WAD",
    (lltv, cursor) => {
      const lif = MarketUtils.getLiquidationIncentiveFactor(lltv, cursor);
      const objectForm = MarketUtils.getLiquidationIncentiveFactor(
        { lltv },
        cursor,
      );

      expect(lif).toBe(refLif(lltv, cursor));
      expect(objectForm).toBe(lif);
      expect(lif).toBeGreaterThanOrEqual(WAD);
      if (lltv === WAD || cursor === 0n) expect(lif).toBe(WAD);
    },
  );

  test.prop([fc.record({ lltv: lltvArb, a: cursorArb, b: cursorArb })], {
    numRuns: 1000,
  })("behavior: non-decreasing in liquidation cursor", ({ lltv, a, b }) => {
    const [c1, c2] = a <= b ? [a, b] : [b, a];
    expect(
      MarketUtils.getLiquidationIncentiveFactor(lltv, c1),
    ).toBeLessThanOrEqual(MarketUtils.getLiquidationIncentiveFactor(lltv, c2));
  });

  test.prop([fc.record({ a: lltvArb, b: lltvArb, cursor: cursorArb })], {
    numRuns: 1000,
  })("behavior: non-increasing in lltv", ({ a, b, cursor }) => {
    const [l1, l2] = a <= b ? [a, b] : [b, a];
    expect(
      MarketUtils.getLiquidationIncentiveFactor(l1, cursor),
    ).toBeGreaterThanOrEqual(
      MarketUtils.getLiquidationIncentiveFactor(l2, cursor),
    );
  });
});

import { fc, test } from "@fast-check/vitest";
import {
  InvalidPositionAccrualTimestampError,
  MathLib,
} from "@morpho-org/morpho-ts";
import type { Address, Hash } from "viem";
import { zeroAddress } from "viem";
import { describe, expect } from "vitest";

import type { IMarket } from "../market/Market.js";
import type { IPosition } from "./Position.js";
import { PositionUtils } from "./PositionUtils.js";

const U128 = MathLib.MAX_UINT_128;

// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
const mulDivUp = (x: bigint, y: bigint, d: bigint) => (x * y + d - 1n) / d;

// Midnight src/Midnight.sol updatePositionView: post-slash amounts + linear fee accrual.
// biome-ignore lint/complexity/useMaxParams: Mirrors the contract's view inputs.
const refAccrue = (
  credit: bigint,
  pendingFee: bigint,
  lastLossFactor: bigint,
  marketLossFactor: bigint,
  lastAccrual: bigint,
  maturity: bigint,
  timestamp: bigint,
) => {
  const postSlashCredit =
    lastLossFactor < U128
      ? (credit * (U128 - marketLossFactor)) / (U128 - lastLossFactor)
      : 0n;
  const postSlashPendingFee =
    credit > 0n
      ? pendingFee - mulDivUp(pendingFee, credit - postSlashCredit, credit)
      : 0n;
  const accrualEnd = timestamp < maturity ? timestamp : maturity;
  const fee =
    lastAccrual < maturity
      ? (postSlashPendingFee * (accrualEnd - lastAccrual)) /
        (maturity - lastAccrual)
      : 0n;

  return { postSlashCredit, postSlashPendingFee, fee };
};

const user = "0x0000000000000000000000000000000000009000" as Address;
const marketId =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hash;

// biome-ignore lint/complexity/useMaxParams: Test fixture builder.
const marketFor = (
  maturity: bigint,
  lossFactor: bigint,
  continuousFeeCredit: bigint,
): IMarket => ({
  params: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770_000_000_000_000_000n,
        liquidationCursor: 250_000_000_000_000_000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  totalUnits: 1_000n,
  lossFactor,
  withdrawable: 500n,
  continuousFeeCredit,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});

// biome-ignore lint/complexity/useMaxParams: Test fixture builder.
const positionFor = (
  credit: bigint,
  pendingFee: bigint,
  lastLossFactor: bigint,
  lastAccrual: bigint,
): IPosition => ({
  user,
  marketId,
  credit,
  pendingFee,
  lastLossFactor,
  lastAccrual,
  debt: 0n,
  collateralBitmap: 1n,
  collateral: [0n],
});

const creditArb = fc.oneof(
  fc.constantFrom(0n, 1n, U128),
  fc.bigInt({ min: 0n, max: U128 }),
);

const lossFactorArb = fc.oneof(
  fc.bigInt({ min: 0n, max: U128 }).map((x) => [x, x] as const),
  fc
    .tuple(fc.bigInt({ min: 0n, max: U128 }), fc.bigInt({ min: 0n, max: U128 }))
    .map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const))),
  fc.constantFrom(
    [0n, U128] as const,
    [0n, 1n] as const,
    [U128, U128] as const,
    [U128 - 1n, U128] as const,
  ),
);

// lastAccrual, maturity, and timestamp >= lastAccrual, biased to the edges
// lastAccrual === maturity, timestamp === maturity, timestamp > maturity.
const timesArb = fc
  .oneof(
    fc.bigInt({ min: 0n, max: 1_000_000n }).map((x) => [x, x] as const),
    fc.tuple(
      fc.bigInt({ min: 0n, max: 1_000_000n }),
      fc.bigInt({ min: 0n, max: 1_000_000n }),
    ),
  )
  .chain(([lastAccrual, maturity]) =>
    fc
      .oneof(
        fc.constant(0n),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        fc.constant(maturity > lastAccrual ? maturity - lastAccrual : 0n),
        fc.constant(maturity > lastAccrual ? maturity - lastAccrual + 1n : 1n),
      )
      .map((delta) => ({
        lastAccrual,
        maturity,
        timestamp: lastAccrual + delta,
      })),
  );

const stateArb = creditArb.chain((credit) =>
  fc.tuple(
    fc.constant(credit),
    fc.oneof(fc.constantFrom(0n, credit), fc.bigInt({ min: 0n, max: credit })),
    lossFactorArb,
    timesArb,
    fc.bigInt({ min: 0n, max: U128 }),
  ),
);

describe("PositionUtils.accrueInterest", () => {
  test("default", () => {
    const { position, market, accruedFee } = PositionUtils.accrueInterest({
      position: positionFor(1_000n, 100n, 0n, 1_000n),
      market: marketFor(54_000n, 0n, 0n),
      timestamp: 1_500n,
    });

    const ref = refAccrue(1_000n, 100n, 0n, 0n, 1_000n, 54_000n, 1_500n);
    expect(position.credit).toBe(ref.postSlashCredit - ref.fee);
    expect(position.pendingFee).toBe(ref.postSlashPendingFee - ref.fee);
    expect(accruedFee).toBe(ref.fee);
    expect(market.continuousFeeCredit).toBe(ref.fee);
  });

  test("floors accrued fee when division is not exact", () => {
    const { position, market, accruedFee } = PositionUtils.accrueInterest({
      position: positionFor(1_000n, 101n, 0n, 1_000n),
      market: marketFor(4_000n, 0n, 0n),
      timestamp: 2_000n,
    });

    expect(accruedFee).toBe(33n);
    expect(position.credit).toBe(967n);
    expect(position.pendingFee).toBe(68n);
    expect(market.continuousFeeCredit).toBe(33n);
  });

  test.prop([stateArb], { numRuns: 1000 })(
    "behavior: equals the Solidity updatePositionView port",
    ([
      credit,
      pendingFee,
      [lastLossFactor, marketLossFactor],
      times,
      cfCredit,
    ]) => {
      const { position, market, accruedFee } = PositionUtils.accrueInterest({
        position: positionFor(
          credit,
          pendingFee,
          lastLossFactor,
          times.lastAccrual,
        ),
        market: marketFor(times.maturity, marketLossFactor, cfCredit),
        timestamp: times.timestamp,
      });

      const ref = refAccrue(
        credit,
        pendingFee,
        lastLossFactor,
        marketLossFactor,
        times.lastAccrual,
        times.maturity,
        times.timestamp,
      );

      expect(position.credit).toBe(ref.postSlashCredit - ref.fee);
      expect(position.pendingFee).toBe(ref.postSlashPendingFee - ref.fee);
      expect(accruedFee).toBe(ref.fee);
      expect(position.lastAccrual).toBe(times.timestamp);
      expect(position.lastLossFactor).toBe(marketLossFactor);
      expect(market.continuousFeeCredit).toBe(cfCredit + ref.fee);
    },
  );

  test.prop(
    [
      creditArb.chain((credit) =>
        fc.tuple(
          fc.constant(credit),
          fc.bigInt({ min: 0n, max: credit }),
          // lastLossFactor === MAX_UINT_128 means the position was fully wiped.
          fc.bigInt({ min: 0n, max: U128 - 1n }),
          timesArb,
        ),
      ),
    ],
    { numRuns: 1000 },
  )(
    "behavior: without slashing, credit minus pendingFee is conserved",
    ([credit, pendingFee, lastLossFactor, times]) => {
      const { position } = PositionUtils.accrueInterest({
        position: positionFor(
          credit,
          pendingFee,
          lastLossFactor,
          times.lastAccrual,
        ),
        market: marketFor(times.maturity, lastLossFactor, 0n),
        timestamp: times.timestamp,
      });

      expect(position.credit - position.pendingFee).toBe(credit - pendingFee);
    },
  );

  test.prop(
    [
      creditArb.chain((credit) =>
        fc.tuple(
          fc.constant(credit),
          fc.bigInt({ min: 0n, max: credit }),
          lossFactorArb,
          fc.bigInt({ min: 0n, max: 1_000_000n }),
          fc.bigInt({ min: 0n, max: 1_000_000n }),
          fc.bigInt({ min: 0n, max: 1_000_000n }),
          fc.bigInt({ min: 0n, max: 1_000_000n }),
        ),
      ),
    ],
    { numRuns: 1000 },
  )(
    "behavior: accrued fee grows monotonically in time, capped by post-slash pendingFee; slashing never increases credit",
    ([
      credit,
      pendingFee,
      [lastLossFactor, marketLossFactor],
      lastAccrual,
      maturity,
      d1,
      d2,
    ]) => {
      const [ts1, ts2] =
        d1 <= d2
          ? [lastAccrual + d1, lastAccrual + d2]
          : [lastAccrual + d2, lastAccrual + d1];
      const position = positionFor(
        credit,
        pendingFee,
        lastLossFactor,
        lastAccrual,
      );
      const market = marketFor(maturity, marketLossFactor, 0n);

      const early = PositionUtils.accrueInterest({
        position,
        market,
        timestamp: ts1,
      });
      const late = PositionUtils.accrueInterest({
        position,
        market,
        timestamp: ts2,
      });

      const ref = refAccrue(
        credit,
        pendingFee,
        lastLossFactor,
        marketLossFactor,
        lastAccrual,
        maturity,
        ts2,
      );

      expect(early.accruedFee).toBeLessThanOrEqual(late.accruedFee);
      expect(late.accruedFee).toBeLessThanOrEqual(ref.postSlashPendingFee);
      expect(late.accruedFee).toBeLessThanOrEqual(pendingFee);
      expect(late.position.credit).toBeLessThanOrEqual(credit);
      // The fee is 0 unless lastAccrual < maturity; the full runway accrues
      // all post-slash pending fees.
      if (lastAccrual < maturity && ts2 >= maturity) {
        expect(late.accruedFee).toBe(ref.postSlashPendingFee);
      }
    },
  );

  test.prop(
    [
      fc
        .bigInt({ min: 1n, max: 1_000_000n })
        .chain((lastAccrual) =>
          fc.tuple(
            fc.constant(lastAccrual),
            fc.bigInt({ min: 0n, max: lastAccrual - 1n }),
          ),
        ),
    ],
    { numRuns: 1000 },
  )(
    "error: InvalidPositionAccrualTimestampError when timestamp is before lastAccrual",
    ([lastAccrual, timestamp]) => {
      expect(() =>
        PositionUtils.accrueInterest({
          position: positionFor(1_000n, 100n, 0n, lastAccrual),
          market: marketFor(54_000n, 0n, 0n),
          timestamp,
        }),
      ).toThrow(InvalidPositionAccrualTimestampError);
    },
  );
});

import { AccrualPosition, BlueErrors, Market } from "@morpho-org/blue-sdk";
import { maxUint256, zeroAddress } from "viem";
import { expect, test, vi } from "vitest";
import { CbbtcUsdcBlue } from "../../test/fixtures/blue.js";
import {
  InputExceedsMaxError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
} from "../types/error.js";
import { quoteBlueRepay } from "./quoteBlueRepay.js";

const now = 1_900_000_000n;
const positionData = new AccrualPosition(
  { user: zeroAddress, supplyShares: 0n, borrowShares: 1000n, collateral: 0n },
  new Market({
    params: CbbtcUsdcBlue,
    totalSupplyAssets: 1_000_000n,
    totalSupplyShares: 1_000_000n,
    totalBorrowAssets: 100_000n,
    totalBorrowShares: 100_000n,
    lastUpdate: now,
    fee: 0n,
    rateAtTarget: 0n,
  }),
);
const params = {
  positionData,
  marketId: positionData.marketId,
  repayAssets: 10n,
  repayShares: 0n,
  deadline: now + 3600n,
  now,
};

test("default: exact assets accrue to the funding horizon", () => {
  const quote = quoteBlueRepay(params);
  expect(quote.expectedRepayAssets).toBe(10n);
  expect(quote.simulatedRepayShares).toBe(0n);
  expect(quote.accruedPosition.market.lastUpdate).toBe(now + 7200n);
  expect(positionData.market.lastUpdate).toBe(now);
});

test.each([100n, maxUint256])(
  "behavior: share repayment %s rounds funding up at the deadline",
  (repayShares) => {
    const quote = quoteBlueRepay({ ...params, repayAssets: 0n, repayShares });
    const shares =
      repayShares === maxUint256 ? positionData.borrowShares : repayShares;
    expect(quote.simulatedRepayShares).toBe(shares);
    expect(quote.accruedPosition.market.lastUpdate).toBe(params.deadline);
    expect(quote.expectedRepayAssets).toBe(
      quote.accruedPosition.market.toBorrowAssets(shares, "Up"),
    );
  },
);

test("behavior: no repayment has zero funding", () => {
  expect(
    quoteBlueRepay({ ...params, repayAssets: 0n }).expectedRepayAssets,
  ).toBe(0n);
});

test.each([undefined, params.deadline])(
  "behavior: share funding reuses the deadline accrual with health timestamp %s",
  (healthTimestamp) => {
    const position = new AccrualPosition(positionData, positionData.market);
    const accrueInterest = vi.spyOn(position, "accrueInterest");
    const quote = quoteBlueRepay({
      ...params,
      positionData: position,
      repayAssets: 0n,
      repayShares: 100n,
      healthTimestamp,
    });
    expect(accrueInterest.mock.calls).toEqual([[params.deadline]]);
    expect(quote.expectedRepayAssets).toBe(
      quote.accruedPosition.market.toBorrowAssets(100n, "Up"),
    );
  },
);

test.each([0n, maxUint256])(
  "behavior: debt-free quote with repay shares %s never accrues market totals",
  (repayShares) => {
    const maxTotal = (1n << 128n) - 1n;
    const debtFree = new AccrualPosition(
      { ...positionData, borrowShares: 0n },
      new Market({
        ...positionData.market,
        totalSupplyAssets: maxTotal,
        totalSupplyShares: maxTotal,
        totalBorrowAssets: maxTotal / 2n,
        totalBorrowShares: maxTotal / 2n,
        rateAtTarget: 100_000_000_000_000n,
      }),
    );
    const quoteParams = {
      ...params,
      positionData: debtFree,
      repayAssets: 0n,
      repayShares,
    };
    expect(() => debtFree.accrueInterest(params.deadline)).toThrow(
      BlueErrors.TotalOverflow,
    );
    const quote = quoteBlueRepay({
      ...quoteParams,
      healthTimestamp: now + 604_800n,
    });
    expect(quote.accruedPosition).toEqual(debtFree);
    expect(quote.accruedPosition).not.toBe(debtFree);
    expect(quote.expectedRepayAssets).toBe(0n);
    expect(quote.simulatedRepayShares).toBe(0n);
    expect(() =>
      quoteBlueRepay({
        ...quoteParams,
        repayShares: maxUint256,
        deadline: now + 7201n,
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      quoteBlueRepay({ ...quoteParams, repayAssets: 1n, repayShares: 0n }),
    ).toThrow(RepayExceedsDebtError);
  },
);

test.each([0n, 10n])(
  "behavior: health timestamp controls the position without changing asset funding %s",
  (repayAssets) => {
    const healthTimestamp = now + 1800n;
    const quote = quoteBlueRepay({ ...params, repayAssets, healthTimestamp });
    expect(quote.accruedPosition.market.lastUpdate).toBe(healthTimestamp);
    expect(quote.expectedRepayAssets).toBe(repayAssets);
    expect(positionData.market.lastUpdate).toBe(now);
  },
);

test("behavior: health timestamp does not shorten share repayment funding", () => {
  const accruingPosition = new AccrualPosition(
    positionData,
    new Market({ ...positionData.market, rateAtTarget: 100_000_000_000_000n }),
  );
  const repayShares = accruingPosition.borrowShares;
  const quote = quoteBlueRepay({
    ...params,
    positionData: accruingPosition,
    repayAssets: 0n,
    repayShares,
    healthTimestamp: now + 1800n,
  });
  expect(quote.accruedPosition.market.lastUpdate).toBe(now + 1800n);
  expect(quote.expectedRepayAssets).toBe(
    accruingPosition
      .accrueInterest(params.deadline)
      .market.toBorrowAssets(repayShares, "Up"),
  );
  expect(quote.expectedRepayAssets).toBeGreaterThan(
    quote.accruedPosition.market.toBorrowAssets(repayShares, "Up"),
  );
});

test("error: health timestamp does not bypass the share funding deadline limit", () => {
  expect(() =>
    quoteBlueRepay({
      ...params,
      repayAssets: 0n,
      repayShares: 1n,
      deadline: now + 7201n,
      healthTimestamp: now + 1800n,
    }),
  ).toThrow(InputExceedsMaxError);
});

test.each([
  [{ repayAssets: 1000n }, RepayExceedsDebtError],
  [{ repayAssets: 0n, repayShares: 1001n }, RepaySharesExceedDebtError],
  [
    { repayAssets: 0n, repayShares: 1n, deadline: now + 7201n },
    InputExceedsMaxError,
  ],
] as const)("error: invalid repayment quote %o", (patch, error) => {
  expect(() => quoteBlueRepay({ ...params, ...patch })).toThrow(error);
});

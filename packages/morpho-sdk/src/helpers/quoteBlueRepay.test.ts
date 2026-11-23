import { AccrualPosition, Market } from "@morpho-org/blue-sdk";
import { maxUint256, zeroAddress } from "viem";
import { expect, test } from "vitest";
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

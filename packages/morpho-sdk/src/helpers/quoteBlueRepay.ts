import { AccrualPosition, type MarketId, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import { InputExceedsMaxError } from "../types/error.js";
import { validateRepayAmount, validateRepayShares } from "./validate.js";

/** @internal Quotes repayment funding without projecting a position for health checks. */
export function quoteBlueRepayFunding(
  params: Parameters<typeof quoteBlueRepay>[0],
): bigint {
  if (params.repayShares > 0n) {
    return quoteBlueRepay(params).expectedRepayAssets;
  }
  if (params.repayAssets > 0n) {
    validateRepayAmount(params);
  }
  return params.repayAssets;
}

/**
 * @internal Quotes repayment funding at the deadline independently of an optional withdrawal-health timestamp.
 * Debt-free positions retain their snapshot without projecting market-wide interest.
 */
export function quoteBlueRepay({
  positionData,
  marketId,
  repayAssets,
  repayShares,
  deadline,
  now,
  healthTimestamp,
}: {
  readonly positionData: AccrualPosition;
  readonly marketId: MarketId;
  readonly repayAssets: bigint;
  readonly repayShares: bigint;
  readonly deadline: bigint;
  readonly now: bigint;
  readonly healthTimestamp?: bigint;
}) {
  const saturatedRepay = repayShares === maxUint256;
  const simulatedRepayShares = saturatedRepay
    ? positionData.borrowShares
    : repayShares;
  if (repayAssets > 0n) {
    validateRepayAmount({ positionData, repayAssets, marketId });
  } else if (repayShares > 0n && !saturatedRepay) {
    validateRepayShares({ positionData, repayShares, marketId });
  }
  const quoteHorizon =
    MathLib.max(now, positionData.market.lastUpdate) + Time.s.from.h(2n);
  if (repayShares > 0n && deadline > quoteHorizon) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: deadline,
      max: quoteHorizon,
    });
  }
  const accrualTimestamp =
    healthTimestamp ?? (repayShares > 0n ? deadline : quoteHorizon);
  const accruedPosition =
    positionData.borrowShares === 0n
      ? new AccrualPosition(positionData, positionData.market)
      : positionData.accrueInterest(accrualTimestamp);
  if (repayAssets > 0n || simulatedRepayShares <= 0n) {
    return {
      simulatedRepayShares,
      accruedPosition,
      expectedRepayAssets: repayAssets,
    };
  }
  const fundingPosition =
    accrualTimestamp === deadline
      ? accruedPosition
      : positionData.accrueInterest(deadline);
  const expectedRepayAssets = fundingPosition.market.toBorrowAssets(
    simulatedRepayShares,
    "Up",
  );
  return { simulatedRepayShares, accruedPosition, expectedRepayAssets };
}

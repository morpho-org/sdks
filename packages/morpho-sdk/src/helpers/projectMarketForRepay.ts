import { type Market, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

/**
 * Forward-accrual buffer applied when sizing share-mode repay calldata.
 *
 * Upper-bounds the on-chain repay price so that `transferAmount` and
 * `maxSharePrice` cover the interest accrued between snapshot and execution.
 * The bundle skims residual loan tokens back to the receiver, so a generous
 * buffer is safe.
 */
export const REPAY_ACCRUAL_BUFFER = Time.s.from.h(2n);

/**
 * Projects a market forward by {@link REPAY_ACCRUAL_BUFFER} for share-mode
 * repay sizing.
 *
 * Returns both the accrued market and the projection timestamp so callers
 * can reuse the same forward point for transfer/`maxSharePrice` sizing.
 *
 * @param market - The market snapshot to project (typically `positionData.market`).
 * @returns The forward-accrued market and the timestamp it was accrued to.
 */
export function projectMarketForRepay(market: Market): {
  marketForRepay: Market;
  accrualTimestamp: bigint;
} {
  const accrualTimestamp =
    MathLib.max(Time.timestamp(), market.lastUpdate) + REPAY_ACCRUAL_BUFFER;
  return {
    marketForRepay: market.accrueInterest(accrualTimestamp),
    accrualTimestamp,
  };
}

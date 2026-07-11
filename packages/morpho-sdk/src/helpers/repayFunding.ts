import { type Market, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { NativeAmountExceedsTransferAmountError } from "../types/index.js";

/**
 * Forward-accrual buffer (in seconds) applied to shares-mode repay funding: the
 * loan tokens routed into the adapter are sized on the debt accrued this far
 * past "now", so the repay stays funded while the transaction waits to execute.
 * The unconsumed remainder is skimmed back to the receiver by the bundle.
 */
export const REPAY_ACCRUAL_BUFFER = Time.s.from.h(2n);

/**
 * Computes the timestamp a shares-mode repay forward-accrues the market to when
 * sizing its funding: the "now" anchor (clamped to the market's `lastUpdate`,
 * which may postdate a stale clock) plus {@link REPAY_ACCRUAL_BUFFER}.
 *
 * Pure — callers supply `now` so the result is reproducible byte-for-byte.
 *
 * @param params - Computation parameters.
 * @param params.now - The "now" anchor as a Unix timestamp in seconds.
 * @param params.lastUpdate - The market's `lastUpdate` timestamp.
 * @returns The buffered accrual timestamp.
 *
 * @example
 * ```ts
 * import { computeRepayAccrualTimestamp } from "@morpho-org/morpho-sdk";
 * import { Time } from "@morpho-org/morpho-ts";
 *
 * const accrualTimestamp = computeRepayAccrualTimestamp({
 *   now: Time.timestamp(),
 *   lastUpdate: market.lastUpdate,
 * });
 * // = max(now, lastUpdate) + 2h
 * ```
 */
export function computeRepayAccrualTimestamp(params: {
  now: bigint;
  lastUpdate: bigint;
}): bigint {
  return MathLib.max(params.now, params.lastUpdate) + REPAY_ACCRUAL_BUFFER;
}

/**
 * Computes the funding envelope of a shares-mode (exact-share / full-close)
 * repay: the market forward-accrued to {@link computeRepayAccrualTimestamp},
 * the total loan tokens routed into the adapter (`transferAmount`, the accrued
 * debt of `shares` rounded up), and the ERC-20 portion pulled from the payer
 * (`erc20Amount = transferAmount - nativeAmount`).
 *
 * Single source of truth for the funding math of `MorphoBlue.repay` /
 * `MorphoBlue.repayWithdrawCollateral` (shares mode). Pure and deterministic —
 * callers supply `now`, so an integrator sizing a native/ERC-20 split ahead of
 * the entity call can pass the same anchor to the entity (its `now` param) and
 * get the exact `erc20Amount` it planned for, instead of a value that drifts
 * with the clock between sizing and build and over-pulls the payer's balance.
 *
 * @param params - Computation parameters.
 * @param params.market - The market snapshot to forward-accrue.
 * @param params.shares - The exact borrow shares the repay burns.
 * @param params.nativeAmount - Native ETH wrapped toward the transfer (default `0n`).
 * @param params.now - The "now" anchor as a Unix timestamp in seconds.
 * @returns `{ accrualTimestamp, accruedMarket, transferAmount, erc20Amount }`.
 * @throws {NativeAmountExceedsTransferAmountError} when `nativeAmount` exceeds
 *   the computed `transferAmount`.
 *
 * @example
 * ```ts
 * import { computeSharesRepayFunding } from "@morpho-org/morpho-sdk";
 * import { Time } from "@morpho-org/morpho-ts";
 *
 * const now = Time.timestamp();
 * const { transferAmount } = computeSharesRepayFunding({
 *   market: positionData.market,
 *   shares: positionData.borrowShares,
 *   now,
 * });
 * // Split transferAmount across ERC-20 balance + native, then build with the
 * // same anchor: market.repay({ shares, nativeAmount, positionData, now }).
 * ```
 */
export function computeSharesRepayFunding(params: {
  market: Market;
  shares: bigint;
  nativeAmount?: bigint;
  now: bigint;
}): {
  accrualTimestamp: bigint;
  accruedMarket: Market;
  transferAmount: bigint;
  erc20Amount: bigint;
} {
  const { market, shares, nativeAmount = 0n, now } = params;

  const accrualTimestamp = computeRepayAccrualTimestamp({
    now,
    lastUpdate: market.lastUpdate,
  });
  const accruedMarket = market.accrueInterest(accrualTimestamp);
  const transferAmount = accruedMarket.toBorrowAssets(shares, "Up");

  if (nativeAmount > transferAmount) {
    throw new NativeAmountExceedsTransferAmountError({
      nativeAmount,
      transferAmount,
      market: market.params.id,
    });
  }

  return {
    accrualTimestamp,
    accruedMarket,
    transferAmount,
    erc20Amount: transferAmount - nativeAmount,
  };
}

import type { IMarketParams, Market } from "@morpho-org/midnight-sdk";
import { maxUint256 } from "viem";
import { WithdrawExceedsCollateralError } from "../types/error.js";
import type { MidnightCollateralTransfer } from "../types/index.js";

/**
 * @internal Applies Midnight bundle withdrawals to a collateral snapshot in order. Callers parse the
 * withdrawals first, so every `collateralIndex` is configured on `market`.
 * A maxUint256 withdrawal uses the balance left at its index by earlier withdrawals.
 * @throws {WithdrawExceedsCollateralError} If a withdrawal exceeds the remaining balance.
 */
export function computeMidnightPostWithdrawalCollateral({
  market,
  marketId,
  collateral,
  withdrawals,
}: {
  readonly market: IMarketParams;
  readonly marketId: Market["id"];
  readonly collateral: readonly bigint[];
  readonly withdrawals: readonly MidnightCollateralTransfer[];
}) {
  const postCollateral = Array.from(
    { length: market.collateralParams.length },
    (_, index) => collateral[index] ?? 0n,
  );
  let withdrawAmount = 0n;
  for (const { collateralIndex, assets } of withdrawals) {
    const index = Number(collateralIndex);
    const available = postCollateral[index] ?? 0n;
    const amount = assets === maxUint256 ? available : assets;
    if (amount > available) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount: amount,
        available,
        market: marketId,
      });
    }
    postCollateral[index] = available - amount;
    withdrawAmount += amount;
  }
  return { postCollateral, withdrawAmount };
}

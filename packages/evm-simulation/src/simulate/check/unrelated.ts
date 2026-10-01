import type { MarketId } from "@morpho-org/blue-sdk";
import { StateChangeMismatchError } from "../../errors.js";
import type { ParsedState } from "../state/types.js";
import { type CheckContext, eq } from "./helpers.js";

/**
 * Reject unrelated state changes: any position or market in `after` that
 * differs from `accruedBefore` while no decoded operation touched it.
 * @internal
 */
export function checkUnrelatedState(params: {
  readonly ctx: CheckContext;
  readonly accruedBefore: ParsedState;
  readonly after: ParsedState;
  readonly touchedMarketIds: ReadonlySet<MarketId>;
}): void {
  const { ctx, accruedBefore, after, touchedMarketIds } = params;
  const context = {
    stage: "verification" as const,
    chainId: ctx.chainId,
    mode: ctx.mode,
    blockNumber: ctx.block.blockNumber,
    field: "unrelatedState",
  };
  for (const position of after.positions) {
    if (touchedMarketIds.has(position.marketId)) continue;
    const prior = accruedBefore.positions.find(
      (p) => p.marketId === position.marketId && eq(p.user, position.user),
    );
    if (prior == null) continue;
    if (
      prior.supplyShares !== position.supplyShares ||
      prior.borrowShares !== position.borrowShares ||
      prior.collateral !== position.collateral
    ) {
      throw new StateChangeMismatchError(
        `Unrelated position ${position.marketId}:${position.user} changed during the bundle`,
        { context },
      );
    }
  }
  for (const market of after.markets) {
    if (touchedMarketIds.has(market.marketId)) continue;
    const prior = accruedBefore.markets.find(
      (m) => m.marketId === market.marketId,
    );
    if (prior == null) continue;
    if (
      prior.totalSupplyAssets !== market.totalSupplyAssets ||
      prior.totalSupplyShares !== market.totalSupplyShares ||
      prior.totalBorrowAssets !== market.totalBorrowAssets ||
      prior.totalBorrowShares !== market.totalBorrowShares
    ) {
      throw new StateChangeMismatchError(
        `Unrelated market ${market.marketId} totals changed during the bundle`,
        { context },
      );
    }
  }
}

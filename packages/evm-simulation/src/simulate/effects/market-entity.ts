import { Market } from "@morpho-org/blue-sdk";
import type { MarketState } from "../../domain/evidence.js";

/**
 * Rebuild a blue-sdk {@link Market} entity from a snapshot state so SDK
 * getters and share math apply without re-implementing formulas. Oracle
 * price and IRM rate are attached only when the snapshot marks them
 * `applicable` — a missing rate disables interest projection, matching the
 * pinned read that produced the state.
 * @internal
 */
export function toMarketEntity(state: MarketState): Market {
  return new Market({
    params: state.market.params,
    totalSupplyAssets: state.totalSupplyAssets,
    totalSupplyShares: state.totalSupplyShares,
    totalBorrowAssets: state.totalBorrowAssets,
    totalBorrowShares: state.totalBorrowShares,
    lastUpdate: state.lastUpdate,
    fee: state.feeWad,
    price:
      state.oraclePrice.type === "applicable"
        ? state.oraclePrice.value.value
        : undefined,
    rateAtTarget:
      state.rateAtTargetPerSecondWad.type === "applicable"
        ? state.rateAtTargetPerSecondWad.value
        : undefined,
  });
}

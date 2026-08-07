import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import type { VaultV2ReallocationData } from "../entities/vaultV2ReallocationData.js";
import {
  InsufficientSharedLiquidityError,
  type ReallocationComputeOptionsVaultV2,
  ReallocationWithdrawExceedsMarketSupplyError,
  type VaultV2BlueReallocation,
} from "../types/index.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "./constant.js";

/**
 * Computes action-ready Vault V2 BluePublicAllocator reallocations for a Blue
 * borrow or loan-asset withdraw.
 *
 * The planner first uses the friendly 90% source-utilization ceiling, then
 * retries from the friendly post-state with a 100% ceiling when the operation
 * would otherwise remain illiquid. It refuses fee-bearing partial plans that
 * cannot cover the operation's absolute shortfall.
 *
 * @param params.reallocationData - Vault V2 reallocation state fetched at one block.
 * @param params.marketId - Target Blue market id.
 * @param params.operation - Operation driving the reallocation.
 * @param params.amount - Borrow or withdraw amount.
 * @param params.options - Optional timestamp, enable flag, vault allowlist, and maximum native penalty.
 * @returns Flat Vault V2 reallocations accepted directly by Blue action builders.
 * @throws {@link InsufficientSharedLiquidityError} when selected liquidity cannot cover the absolute shortfall.
 * @throws {@link ReallocationWithdrawExceedsMarketSupplyError} when a withdraw exceeds market supply.
 * @example
 * ```ts
 * import { computeVaultV2Reallocations } from "@morpho-org/morpho-sdk";
 *
 * const reallocations = computeVaultV2Reallocations({
 *   reallocationData,
 *   marketId,
 *   operation: "borrow",
 *   amount: 1_000_000n,
 *   options: { timestamp },
 * });
 * ```
 */
export const computeVaultV2Reallocations = ({
  reallocationData: data,
  marketId,
  operation,
  amount,
  options,
}: {
  readonly reallocationData: VaultV2ReallocationData;
  readonly marketId: MarketId;
  readonly operation: "borrow" | "withdraw";
  readonly amount: bigint;
  readonly options?: ReallocationComputeOptionsVaultV2;
}): readonly VaultV2BlueReallocation[] => {
  if (options?.enabled === false) return [];

  const market = data.getMarket(marketId).accrueInterest(options?.timestamp);
  if (operation === "withdraw" && amount > market.totalSupplyAssets) {
    throw new ReallocationWithdrawExceedsMarketSupplyError({
      marketId,
      withdrawAmount: amount,
      totalSupplyAssets: market.totalSupplyAssets,
    });
  }

  const newTotalBorrowAssets =
    operation === "borrow"
      ? market.totalBorrowAssets + amount
      : market.totalBorrowAssets;
  const newTotalSupplyAssets =
    operation === "withdraw"
      ? market.totalSupplyAssets - amount
      : market.totalSupplyAssets;

  if (
    MarketUtils.getUtilization({
      totalSupplyAssets: newTotalSupplyAssets,
      totalBorrowAssets: newTotalBorrowAssets,
    }) <= DEFAULT_SUPPLY_TARGET_UTILIZATION
  )
    return [];

  let requiredAssets =
    MathLib.wDivDown(newTotalBorrowAssets, DEFAULT_SUPPLY_TARGET_UTILIZATION) -
    newTotalSupplyAssets;

  const friendly = data.computeVaultV2Reallocations(marketId, options);
  const discovered = [...friendly.reallocations];
  const friendlyMarket = friendly.data.getMarket(marketId);
  const friendlyBorrow =
    operation === "borrow"
      ? friendlyMarket.totalBorrowAssets + amount
      : friendlyMarket.totalBorrowAssets;
  const friendlySupply =
    operation === "withdraw"
      ? friendlyMarket.totalSupplyAssets - amount
      : friendlyMarket.totalSupplyAssets;

  if (friendlyBorrow > friendlySupply) {
    requiredAssets = newTotalBorrowAssets - newTotalSupplyAssets;
    discovered.push(
      ...friendly.data._computeVaultV2Reallocations({
        marketId,
        maxWithdrawalUtilization: MathLib.WAD,
        options,
      }).reallocations,
    );
  }

  if (requiredAssets <= 0n) return [];

  const absoluteShortfall =
    newTotalBorrowAssets > newTotalSupplyAssets
      ? newTotalBorrowAssets - newTotalSupplyAssets
      : 0n;
  const reallocations: VaultV2BlueReallocation[] = [];
  let remainingRequiredAssets = requiredAssets;
  let totalReallocated = 0n;

  for (const reallocation of discovered) {
    const assets = MathLib.min(reallocation.assets, remainingRequiredAssets);
    if (assets <= 0n) continue;

    reallocations.push({ ...reallocation, assets });
    remainingRequiredAssets -= assets;
    totalReallocated += assets;
    if (remainingRequiredAssets === 0n) break;
  }

  if (totalReallocated < absoluteShortfall) {
    throw new InsufficientSharedLiquidityError({
      marketId,
      shortfall: absoluteShortfall,
      available: totalReallocated,
    });
  }

  return reallocations;
};

import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import {
  InsufficientSharedLiquidityError,
  MissingPublicAllocatorConfigError,
  type ReallocationComputeOptions,
  type VaultReallocation,
} from "../types/index.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "./constant.js";
import type { ReallocationData } from "./reallocationData.js";

/**
 * Computes vault reallocations for a borrow operation on a target market.
 *
 * Replicates the shared liquidity algorithm from `populateSubBundle` in
 * `@morpho-org/bundler-sdk-viem`. First attempts "friendly" reallocations
 * respecting withdrawal utilization targets, then falls back to aggressive
 * reallocations (100% withdrawal utilization) if liquidity is still insufficient.
 *
 * @param params.reallocationData - The local state containing market, vault, and position data.
 * @param params.marketId - The target market to reallocate liquidity into.
 * @param params.borrowAmount - The intended borrow amount (used to compute post-borrow utilization).
 * @param params.options - Optional reallocation computation options.
 * @returns Array of vault reallocations, sorted with withdrawals in ascending market id order.
 * @throws {InsufficientSharedLiquidityError} If shared liquidity cannot cover the borrow shortfall on the target market — preventing fee-bearing reallocations from being attached to a borrow that would still revert onchain.
 */
export const computeReallocations = ({
  reallocationData: data,
  marketId,
  borrowAmount,
  options,
}: {
  readonly reallocationData: ReallocationData;
  readonly marketId: MarketId;
  readonly borrowAmount: bigint;
  readonly options?: ReallocationComputeOptions;
}): readonly VaultReallocation[] => {
  if (options?.enabled === false) return [];

  const market = data.getMarket(marketId).accrueInterest(options?.timestamp);

  const newTotalBorrowAssets = market.totalBorrowAssets + borrowAmount;
  const newTotalSupplyAssets = market.totalSupplyAssets;

  const supplyTargetUtilization =
    options?.supplyTargetUtilization?.[market.params.id] ??
    options?.defaultSupplyTargetUtilization ??
    DEFAULT_SUPPLY_TARGET_UTILIZATION;

  if (
    MarketUtils.getUtilization({
      totalSupplyAssets: newTotalSupplyAssets,
      totalBorrowAssets: newTotalBorrowAssets,
    }) <= supplyTargetUtilization
  )
    return [];

  // Solve: newTotalBorrowAssets / (newTotalSupplyAssets + reallocatedAssets) = supplyTargetUtilization
  let requiredAssets =
    supplyTargetUtilization === 0n
      ? MathLib.MAX_UINT_160
      : MathLib.wDivDown(newTotalBorrowAssets, supplyTargetUtilization) -
        newTotalSupplyAssets;

  // Phase 1: "friendly" reallocations respecting withdrawal utilization targets.
  const { withdrawals: friendlyWithdrawals, data: friendlyReallocationData } =
    data.getMarketPublicReallocations(market.id, options?.timestamp, options);

  const withdrawals = [...friendlyWithdrawals];

  const friendlyReallocationMarket = friendlyReallocationData.getMarket(
    market.id,
  );

  if (
    friendlyReallocationMarket.totalBorrowAssets + borrowAmount >
    friendlyReallocationMarket.totalSupplyAssets
  ) {
    // Phase 2: "aggressive" — fully withdraw from every market (100% utilization).
    requiredAssets = newTotalBorrowAssets - newTotalSupplyAssets;
    withdrawals.push(
      ...friendlyReallocationData.getMarketPublicReallocations(
        market.id,
        options?.timestamp,
        {
          ...options,
          defaultMaxWithdrawalUtilization: MathLib.WAD,
          maxWithdrawalUtilization: {},
        },
      ).withdrawals,
    );
  }

  if (requiredAssets <= 0n) return [];

  // Liquidity strictly required for `morphoBorrow` to succeed onchain.
  const absoluteShortfall =
    newTotalBorrowAssets > newTotalSupplyAssets
      ? newTotalBorrowAssets - newTotalSupplyAssets
      : 0n;

  // Group withdrawals by vault, capping total at requiredAssets.
  const reallocationsMap: Record<Address, { id: MarketId; assets: bigint }[]> =
    {};
  let totalReallocated = 0n;

  for (const { vault, ...withdrawal } of withdrawals) {
    const vaultReallocations = (reallocationsMap[vault] ??= []);
    const existing = vaultReallocations.find(
      (item) => item.id === withdrawal.id,
    );
    const reallocatedAssets = MathLib.min(withdrawal.assets, requiredAssets);

    if (reallocatedAssets <= 0n) continue;

    if (existing != null) {
      existing.assets += reallocatedAssets;
    } else {
      vaultReallocations.push({
        ...withdrawal,
        assets: reallocatedAssets,
      });
    }

    requiredAssets -= reallocatedAssets;
    totalReallocated += reallocatedAssets;
    if (requiredAssets === 0n) break;
  }

  // Refuse fee-bearing partial plans for an unreachable borrow.
  if (totalReallocated < absoluteShortfall) {
    throw new InsufficientSharedLiquidityError({
      marketId,
      shortfall: absoluteShortfall,
      available: totalReallocated,
    });
  }

  // Transform into VaultReallocation[] format.
  return Object.entries(reallocationsMap)
    .filter(([, vaultWithdrawals]) => vaultWithdrawals.length > 0)
    .map(([vault, vaultWithdrawals]) => ({
      vault: vault as Address,
      fee: (() => {
        const config = data.getVault(vault as Address).publicAllocatorConfig;
        if (config == null) {
          throw new MissingPublicAllocatorConfigError(vault);
        }
        return config.fee;
      })(),
      withdrawals: vaultWithdrawals
        // Reallocation withdrawals must be sorted by market id in ascending order.
        .sort(({ id: idA }, { id: idB }) => idA.localeCompare(idB))
        .map(({ id, assets }) => ({
          marketParams: data.getMarket(id).params,
          amount: assets,
        })),
    }));
};

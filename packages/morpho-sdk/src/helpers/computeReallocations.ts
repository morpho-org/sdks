import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "@morpho-org/bundler-sdk-viem";
import type { SimulationState } from "@morpho-org/simulation-sdk";
import type { Address } from "viem";
import {
  MissingPublicAllocatorConfigError,
  type ReallocationComputeOptions,
  type VaultReallocation,
} from "../types/index.js";

/**
 * Computes vault reallocations for a borrow operation on a target market.
 *
 * Replicates the shared liquidity algorithm from `populateSubBundle` in
 * `@morpho-org/bundler-sdk-viem`. First attempts "friendly" reallocations
 * respecting withdrawal utilization targets, then falls back to aggressive
 * reallocations (100% withdrawal utilization) if liquidity is still insufficient.
 *
 * @param params.reallocationData - The simulation state containing market, vault, and position data.
 * @param params.marketId - The target market to reallocate liquidity into.
 * @param params.borrowAmount - The intended borrow amount (used to compute post-borrow utilization).
 * @param params.options - Optional reallocation computation options.
 * @returns Array of vault reallocations, sorted with withdrawals in ascending market id order.
 */
export const computeReallocations = ({
  reallocationData: data,
  marketId,
  borrowAmount,
  options,
}: {
  readonly reallocationData: SimulationState;
  readonly marketId: MarketId;
  readonly borrowAmount: bigint;
  readonly options?: ReallocationComputeOptions;
}): readonly VaultReallocation[] => {
  if (options?.enabled === false) return [];

  const market = data.getMarket(marketId).accrueInterest(data.block.timestamp);

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
    data.getMarketPublicReallocations(market.id, options);

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
      ...friendlyReallocationData.getMarketPublicReallocations(market.id, {
        ...options,
        defaultMaxWithdrawalUtilization: MathLib.WAD,
        maxWithdrawalUtilization: {},
      }).withdrawals,
    );
  }

  if (requiredAssets <= 0n) return [];

  // Group withdrawals by vault, capping total at requiredAssets.
  const reallocationsMap: Record<Address, { id: MarketId; assets: bigint }[]> =
    {};

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
    if (requiredAssets === 0n) break;
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
        .sort(({ id: idA }, { id: idB }) =>
          idA > idB ? 1 : idA < idB ? -1 : 0,
        )
        .map(({ id, assets }) => ({
          marketParams: data.getMarket(id).params,
          amount: assets,
        })),
    }));
};

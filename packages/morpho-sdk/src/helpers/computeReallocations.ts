import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "@morpho-org/bundler-sdk-viem";
import type { SimulationState } from "@morpho-org/simulation-sdk";
import type { Address } from "viem";
import {
  InsufficientSharedLiquidityError,
  MissingPublicAllocatorConfigError,
  type ReallocationComputeOptions,
  ReallocationWithdrawExceedsMarketSupplyError,
  type VaultReallocation,
} from "../types/index.js";

/**
 * Computes vault reallocations for a `borrow` or `withdraw` on a target market.
 *
 * Replicates the shared-liquidity algorithm from `populateSubBundle` in
 * `@morpho-org/bundler-sdk-viem`. First attempts "friendly" reallocations
 * respecting withdrawal utilization targets, then falls back to aggressive
 * reallocations (100% withdrawal utilization) if liquidity is still insufficient.
 *
 * Algebra branches on `operation`:
 * - `"borrow"`: `S' = S`, `B' = B + amount` (additional borrow demand).
 * - `"withdraw"`: `S' = S − amount`, `B' = B` (supply-side shrinkage).
 *
 * In both cases reallocated assets are added on the supply side; `requiredAssets`
 * and `absoluteShortfall` are derived from the operation-specific post-state.
 *
 * @param params.reallocationData - The simulation state containing market, vault, and position data.
 * @param params.marketId - The target market to reallocate liquidity into.
 * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
 * @param params.amount - The borrow or withdraw amount used to compute the post-state utilization.
 * @param params.options - Optional reallocation computation options.
 * @returns Array of vault reallocations, sorted with withdrawals in ascending market id order.
 * @throws {InsufficientSharedLiquidityError} If shared liquidity cannot cover the operation's
 *   absolute shortfall on the target market — preventing fee-bearing reallocations from being
 *   attached to a call that would still revert onchain.
 * @throws {ReallocationWithdrawExceedsMarketSupplyError} If `operation === "withdraw"` and
 *   `amount` exceeds the target market's `totalSupplyAssets` — the on-chain call would revert
 *   regardless of reallocations.
 * @throws {MissingPublicAllocatorConfigError} When a vault selected for reallocation has no
 *   PublicAllocator configuration in the simulation state.
 */
export const computeReallocations = ({
  reallocationData: data,
  marketId,
  operation,
  amount,
  options,
}: {
  readonly reallocationData: SimulationState;
  readonly marketId: MarketId;
  readonly operation: "borrow" | "withdraw";
  readonly amount: bigint;
  readonly options?: ReallocationComputeOptions;
}): readonly VaultReallocation[] => {
  if (options?.enabled === false) return [];

  const market = data.getMarket(marketId).accrueInterest(data.block.timestamp);

  // Reject unreachable withdraws before any utilization math: a negative
  // post-supply yields a negative utilization that short-circuits the
  // utilization gate below and silently returns `[]` — masking a sure revert.
  if (operation === "withdraw" && amount > market.totalSupplyAssets) {
    throw new ReallocationWithdrawExceedsMarketSupplyError({
      marketId,
      withdrawAmount: amount,
      totalSupplyAssets: market.totalSupplyAssets,
    });
  }

  // Post-state utilization is operation-dependent.
  const newTotalBorrowAssets =
    operation === "borrow"
      ? market.totalBorrowAssets + amount
      : market.totalBorrowAssets;
  const newTotalSupplyAssets =
    operation === "withdraw"
      ? market.totalSupplyAssets - amount
      : market.totalSupplyAssets;

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

  // Operation-specific post-friendly check: would the on-chain call still revert?
  const friendlyBorrow =
    operation === "borrow"
      ? friendlyReallocationMarket.totalBorrowAssets + amount
      : friendlyReallocationMarket.totalBorrowAssets;
  const friendlySupply =
    operation === "withdraw"
      ? friendlyReallocationMarket.totalSupplyAssets - amount
      : friendlyReallocationMarket.totalSupplyAssets;

  if (friendlyBorrow > friendlySupply) {
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

  // Liquidity strictly required for the on-chain call to succeed.
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

  // Refuse fee-bearing partial plans for an unreachable operation.
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
        .sort(({ id: idA }, { id: idB }) =>
          idA > idB ? 1 : idA < idB ? -1 : 0,
        )
        .map(({ id, assets }) => ({
          marketParams: data.getMarket(id).params,
          amount: assets,
        })),
    }));
};

import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type { ReallocationData } from "../entities/reallocationData.js";
import {
  InsufficientSharedLiquidityError,
  MissingPublicAllocatorConfigError,
  type PublicReallocation,
  type ReallocationComputeOptions,
  type VaultReallocation,
} from "../types/index.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "./constant.js";
import { compareMarketIds } from "./validate.js";

type VaultWithdrawalGroup = {
  readonly vault: Address;
  readonly firstIndex: number;
  totalAssets: bigint;
  readonly withdrawals: { readonly id: MarketId; readonly assets: bigint }[];
};

const groupWithdrawalsByVault = (
  withdrawals: readonly PublicReallocation[],
) => {
  const groups: VaultWithdrawalGroup[] = [];
  const groupsByVault = new Map<Address, VaultWithdrawalGroup>();

  for (const [index, { vault, id, assets }] of withdrawals.entries()) {
    if (assets <= 0n) continue;

    let group = groupsByVault.get(vault);
    if (group == null) {
      group = {
        vault,
        firstIndex: index,
        totalAssets: 0n,
        withdrawals: [],
      };
      groupsByVault.set(vault, group);
      groups.push(group);
    }

    group.totalAssets += assets;
    group.withdrawals.push({ id, assets });
  }

  return groups.sort((a, b) => {
    if (a.totalAssets > b.totalAssets) return -1;
    if (a.totalAssets < b.totalAssets) return 1;

    return a.firstIndex - b.firstIndex;
  });
};

const capVaultWithdrawals = (
  withdrawals: readonly { readonly id: MarketId; readonly assets: bigint }[],
  assets: bigint,
) => {
  const cappedWithdrawals: { id: MarketId; assets: bigint }[] = [];
  let remainingAssets = assets;

  for (const withdrawal of withdrawals) {
    const cappedAssets = MathLib.min(withdrawal.assets, remainingAssets);
    if (cappedAssets <= 0n) continue;

    const existing = cappedWithdrawals.find(
      (item) => item.id === withdrawal.id,
    );
    if (existing != null) {
      existing.assets += cappedAssets;
    } else {
      cappedWithdrawals.push({
        id: withdrawal.id,
        assets: cappedAssets,
      });
    }

    remainingAssets -= cappedAssets;
    if (remainingAssets === 0n) break;
  }

  return cappedWithdrawals;
};

/**
 * Computes vault reallocations for a borrow operation on a target market.
 *
 * First attempts "friendly" reallocations respecting withdrawal utilization
 * targets, then falls back to aggressive reallocations (100% withdrawal
 * utilization) if liquidity is still insufficient.
 *
 * @remarks Pass `options.timestamp` from the same block used to fetch `reallocationData`; when omitted, market accrual falls back to the target market's `lastUpdate`, which can diverge from the source rows' fetch block. Per-market `maxWithdrawalUtilization` overrides apply only to phase 1; phase 2 forces 100% utilization on every source market.
 * @param params.reallocationData - The local state containing market, vault, and position data.
 * @param params.marketId - The target market to reallocate liquidity into.
 * @param params.borrowAmount - The intended borrow amount (used to compute post-borrow utilization).
 * @param params.options - Optional reallocation computation options.
 * @returns Array of vault reallocations, sorted with withdrawals in ascending market id order.
 * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the borrow shortfall on the target market — preventing fee-bearing reallocations from being attached to a borrow that would still revert onchain.
 * @throws {MissingPublicAllocatorConfigError} when a selected vault is missing its public allocator config.
 * @example
 * ```ts
 * import { createPublicClient, http, parseUnits } from "viem";
 * import { mainnet } from "viem/chains";
 * import { markets, vaults } from "@morpho-org/morpho-test";
 * import {
 *   computeReallocations,
 *   morphoViemExtension,
 * } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http(),
 * }).extend(morphoViemExtension());
 *
 * const userAddress = "0x000000000000000000000000000000000000dEaD";
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const market = client.morpho.marketV1(marketParams, mainnet.id);
 * const block = await client.getBlock();
 * const reallocationData = await market.getReallocationData({
 *   vaultAddresses: [vaults[mainnet.id].steakUsdc.address],
 *   block: { number: block.number, timestamp: block.timestamp },
 * });
 * const borrowAmount = parseUnits("1000", 6);
 * const reallocations = computeReallocations({
 *   reallocationData,
 *   marketId: marketParams.id,
 *   borrowAmount,
 *   options: { timestamp: block.timestamp },
 * });
 * const positionData = await market.getPositionData(userAddress);
 * const borrow = market.borrow({
 *   userAddress,
 *   amount: borrowAmount,
 *   positionData,
 *   reallocations,
 * });
 * // borrow.buildTx() includes any required PublicAllocator reallocations.
 * ```
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

  // ReallocationData does not retain the fetch block; pass that block timestamp
  // to compute against the same accrued state, otherwise Market defaults to lastUpdate.
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

  // Liquidity strictly required for `morphoBorrow` to succeed onchain.
  const absoluteShortfall =
    newTotalBorrowAssets > newTotalSupplyAssets
      ? newTotalBorrowAssets - newTotalSupplyAssets
      : 0n;

  const reallocations: {
    readonly vault: Address;
    readonly withdrawals: { readonly id: MarketId; readonly assets: bigint }[];
  }[] = [];
  let totalReallocated = 0n;
  let remainingRequiredAssets = requiredAssets;

  for (const group of groupWithdrawalsByVault(withdrawals)) {
    const reallocatedAssets = MathLib.min(
      group.totalAssets,
      remainingRequiredAssets,
    );

    if (reallocatedAssets <= 0n) continue;

    reallocations.push({
      vault: group.vault,
      withdrawals: capVaultWithdrawals(group.withdrawals, reallocatedAssets),
    });

    remainingRequiredAssets -= reallocatedAssets;
    totalReallocated += reallocatedAssets;
    if (remainingRequiredAssets === 0n) break;
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
  return reallocations
    .filter(({ withdrawals: vaultWithdrawals }) => vaultWithdrawals.length > 0)
    .map(({ vault, withdrawals: vaultWithdrawals }) => ({
      vault,
      fee: (() => {
        const config = data.getVault(vault).publicAllocatorConfig;
        if (config == null) {
          throw new MissingPublicAllocatorConfigError(vault);
        }
        return config.fee;
      })(),
      withdrawals: vaultWithdrawals
        // Reallocation withdrawals must be sorted by market id in ascending
        // order. Normalize first because `MarketId` can be mixed-case hex.
        .sort(({ id: idA }, { id: idB }) => compareMarketIds(idA, idB))
        .map(({ id, assets }) => ({
          marketParams: data.getMarket(id).params,
          amount: assets,
        })),
    }));
};

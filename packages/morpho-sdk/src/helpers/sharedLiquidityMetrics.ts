import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
import type { ReallocationData } from "../entities/reallocationData.js";
import type { PublicAllocatorOptions } from "../types/index.js";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "./constant.js";

/**
 * Computes the total shared liquidity (in loan-token assets) that the public
 * allocator can reallocate into `marketId` from sibling markets.
 *
 * This is a read-only metric: it sums the source-market withdrawals discovered
 * by {@link ReallocationData.getMarketPublicReallocations} and never throws on
 * insufficiency — when no liquidity is available it returns `0n`. The amount is
 * bounded by each source market's withdrawal utilization cap
 * (`maxWithdrawalUtilization` / `defaultMaxWithdrawalUtilization`, defaulting to
 * the "friendly" 92% ceiling) and by the target market's vault supply-cap
 * headroom. Pass `options.defaultMaxWithdrawalUtilization: MathLib.WAD` to
 * measure the aggressive amount (source markets drained to 100% utilization).
 *
 * @param params.reallocationData - Local state from {@link MorphoBlue.getReallocationData}.
 * @param params.marketId - The target market that would receive the shared liquidity.
 * @param params.options - Optional allocator discovery options (timestamp, reallocatable vaults, withdrawal utilization caps).
 * @returns The total reallocatable assets, in loan-token units. `0n` when no liquidity is available or `options.enabled === false`.
 * @throws {UnknownReallocationMarketError} when the target market is absent from `reallocationData`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { markets, vaults } from "@morpho-org/morpho-test";
 * import {
 *   computeAvailableSharedLiquidity,
 *   morphoViemExtension,
 * } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http(),
 * }).extend(morphoViemExtension());
 *
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const market = client.morpho.blue(marketParams, mainnet.id);
 * const block = await client.getBlock();
 * const reallocationData = await market.getReallocationData({
 *   vaultAddresses: [vaults[mainnet.id].steakUsdc.address],
 *   block: { number: block.number, timestamp: block.timestamp },
 * });
 * const available = computeAvailableSharedLiquidity({
 *   reallocationData,
 *   marketId: marketParams.id,
 *   options: { timestamp: block.timestamp },
 * });
 * // available satisfies bigint
 * ```
 */
export const computeAvailableSharedLiquidity = ({
  reallocationData,
  marketId,
  options,
}: {
  readonly reallocationData: ReallocationData;
  readonly marketId: MarketId;
  readonly options?: PublicAllocatorOptions;
}): bigint => {
  const { withdrawals } = reallocationData.getMarketPublicReallocations(
    marketId,
    options,
  );

  return withdrawals.reduce((total, { assets }) => total + assets, 0n);
};

/**
 * Computes the liquidity (in loan-token assets) available to borrow from
 * `marketId` while keeping its utilization at or below `targetUtilization`,
 * counting both the target's own headroom and the shared liquidity the public
 * allocator can reallocate in (draining source markets to 100% utilization).
 *
 * This is the read-only counterpart to {@link computeReallocations}: it takes no
 * borrow/withdraw amount. The metric is only meaningful while the target market
 * is healthy (below the ceiling); once it is at or above `targetUtilization`
 * there is no borrowable liquidity left, so:
 *
 * - **Target utilization below the ceiling** → returns
 *   {@link Market.getBorrowToUtilization} (the borrow amount that brings the
 *   target up to `targetUtilization`) plus the shared liquidity drained from
 *   source markets at 100% utilization.
 * - **Target utilization at or above the ceiling** → returns `0n`.
 *
 * Like {@link computeAvailableSharedLiquidity}, it never throws on insufficiency.
 *
 * @param params.reallocationData - Local state from {@link MorphoBlue.getReallocationData}.
 * @param params.marketId - The target market that would receive the shared liquidity.
 * @param params.targetUtilization - Target-market utilization ceiling, scaled by WAD. Defaults to {@link DEFAULT_SUPPLY_TARGET_UTILIZATION} (90.5%).
 * @param params.options - Optional allocator discovery options (timestamp, reallocatable vaults). Source withdrawal-utilization caps are overridden to drain sources to 100%.
 * @returns The borrowable liquidity, in loan-token units, that keeps the target at or below `targetUtilization`. `0n` when the target is already at or above the ceiling.
 * @throws {UnknownReallocationMarketError} when the target market is absent from `reallocationData`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { markets, vaults } from "@morpho-org/morpho-test";
 * import {
 *   computeAvailableLiquidityToTargetUtilization,
 *   morphoViemExtension,
 * } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http(),
 * }).extend(morphoViemExtension());
 *
 * const marketParams = markets[mainnet.id].usdc_wbtc;
 * const market = client.morpho.blue(marketParams, mainnet.id);
 * const block = await client.getBlock();
 * const reallocationData = await market.getReallocationData({
 *   vaultAddresses: [vaults[mainnet.id].steakUsdc.address],
 *   block: { number: block.number, timestamp: block.timestamp },
 * });
 * const available = computeAvailableLiquidityToTargetUtilization({
 *   reallocationData,
 *   marketId: marketParams.id,
 *   options: { timestamp: block.timestamp },
 * });
 * // available satisfies bigint
 * ```
 */
export const computeAvailableLiquidityToTargetUtilization = ({
  reallocationData,
  marketId,
  targetUtilization = DEFAULT_SUPPLY_TARGET_UTILIZATION,
  options,
}: {
  readonly reallocationData: ReallocationData;
  readonly marketId: MarketId;
  readonly targetUtilization?: bigint;
  readonly options?: PublicAllocatorOptions;
}): bigint => {
  const market = reallocationData
    .getMarket(marketId)
    .accrueInterest(options?.timestamp);

  // Borrowable headroom on the target's own liquidity; 0n once util ≥ ceiling.
  const ownHeadroom = market.getBorrowToUtilization(targetUtilization);
  if (ownHeadroom === 0n) return 0n;

  const sharedLiquidity = computeAvailableSharedLiquidity({
    reallocationData,
    marketId,
    options: {
      ...options,
      defaultMaxWithdrawalUtilization: MathLib.WAD,
      maxWithdrawalUtilization: {},
    },
  });

  return ownHeadroom + sharedLiquidity;
};

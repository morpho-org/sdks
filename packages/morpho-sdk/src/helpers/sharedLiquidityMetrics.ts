import { type MarketId, MarketUtils, MathLib } from "@morpho-org/blue-sdk";
import type { ReallocationData } from "../entities/reallocationData.js";
import type { PublicAllocatorOptions } from "../types/index.js";

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
 * Computes the maximum additional borrow on `marketId` that keeps the target
 * market's post-borrow utilization at or below `targetUtilization`, accounting
 * for the shared liquidity sibling vaults can supply via the public allocator.
 *
 * Read-only metric for the UI: it draws on the maximum available shared
 * liquidity (every source market drained to 100% withdrawal utilization — i.e.
 * friendly **and** aggressive reallocations) while never pushing the target
 * market past `targetUtilization`. It never throws on insufficiency — when the
 * market is already at or above the target even with shared liquidity, it
 * returns `0n`.
 *
 * The result equals `max(0, (totalSupplyAssets + sharedLiquidity) × targetUtilization − totalBorrowAssets)`
 * on the interest-accrued target market.
 *
 * @param params.reallocationData - Local state from {@link MorphoBlue.getReallocationData}.
 * @param params.marketId - The target market to borrow from.
 * @param params.targetUtilization - The utilization ceiling to maintain, scaled by WAD (e.g. `900000000000000000n` for 90%).
 * @param params.options - Optional allocator discovery options. `defaultMaxWithdrawalUtilization` / `maxWithdrawalUtilization` are overridden internally to drain source markets to 100%; pass `timestamp` to accrue interest at the fetched block.
 * @returns The maximum borrowable assets, in loan-token units. `0n` when the target is already met without borrowing.
 * @throws {UnknownReallocationMarketError} when the target market is absent from `reallocationData`.
 * @example
 * ```ts
 * import { createPublicClient, http, parseEther } from "viem";
 * import { mainnet } from "viem/chains";
 * import { markets, vaults } from "@morpho-org/morpho-test";
 * import {
 *   computeMaxBorrowToUtilization,
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
 * const maxBorrow = computeMaxBorrowToUtilization({
 *   reallocationData,
 *   marketId: marketParams.id,
 *   targetUtilization: parseEther("0.9"), // hold the market at 90% utilization
 *   options: { timestamp: block.timestamp },
 * });
 * // maxBorrow satisfies bigint
 * ```
 */
export const computeMaxBorrowToUtilization = ({
  reallocationData,
  marketId,
  targetUtilization,
  options,
}: {
  readonly reallocationData: ReallocationData;
  readonly marketId: MarketId;
  readonly targetUtilization: bigint;
  readonly options?: PublicAllocatorOptions;
}): bigint => {
  // ReallocationData does not retain the fetch block; accrue against the same
  // timestamp used to fetch it, otherwise Market defaults to lastUpdate.
  const market = reallocationData
    .getMarket(marketId)
    .accrueInterest(options?.timestamp);

  // Maximum shared liquidity: drain every source market to 100% withdrawal
  // utilization (friendly + aggressive). The target market ceiling stays
  // governed by `targetUtilization` below, not by the source-market caps.
  const sharedLiquidity = computeAvailableSharedLiquidity({
    reallocationData,
    marketId,
    options: {
      ...options,
      defaultMaxWithdrawalUtilization: MathLib.WAD,
      maxWithdrawalUtilization: {},
    },
  });

  return MarketUtils.getBorrowToUtilization(
    {
      totalSupplyAssets: market.totalSupplyAssets + sharedLiquidity,
      totalBorrowAssets: market.totalBorrowAssets,
    },
    targetUtilization,
  );
};

import type { MarketId } from "@morpho-org/blue-sdk";
import type { ReallocationData } from "../entities/reallocationData.js";
import type {
  PublicAllocatorOptions,
  ReallocationComputeOptions,
} from "../types/index.js";
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
 * Computes the liquidity (in loan-token assets) available to bring `marketId`
 * to `targetUtilization`, counting the market's own borrow headroom plus the
 * shared liquidity the public allocator can reallocate in from sibling vaults.
 *
 * Read-only counterpart to {@link computeReallocations} — takes no borrow/withdraw
 * amount and never throws on insufficiency:
 * - When `supplyTargetUtilization > targetUtilization`, shared-liquidity
 *   reallocation would not trigger at the requested target, so only the
 *   market's own headroom is returned.
 * - When `targetUtilization` equals the market's current utilization, the
 *   market has no own headroom left, so only the shared liquidity is returned.
 * - Otherwise the own headroom and the shared liquidity are summed.
 *
 * Own headroom is {@link Market.getBorrowToUtilization}; shared liquidity is
 * {@link computeAvailableSharedLiquidity} evaluated with the same `options`.
 *
 * @param params.reallocationData - Local state from {@link MorphoBlue.getReallocationData}.
 * @param params.marketId - The target market that would receive the shared liquidity.
 * @param params.targetUtilization - Target-market utilization to reach, scaled by WAD. Defaults to {@link DEFAULT_SUPPLY_TARGET_UTILIZATION} (90.5%).
 * @param params.options - Optional reallocation options. `supplyTargetUtilization` / `defaultSupplyTargetUtilization` set the reallocation trigger; `timestamp` accrues interest; withdrawal-utilization caps bound the shared liquidity.
 * @returns The available liquidity to the target utilization, in loan-token units. `0n` when none is available.
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
  readonly options?: ReallocationComputeOptions;
}): bigint => {
  const market = reallocationData
    .getMarket(marketId)
    .accrueInterest(options?.timestamp);

  // The market's own borrow headroom to the target utilization (no reallocation).
  const ownHeadroom = market.getBorrowToUtilization(targetUtilization);

  const supplyTargetUtilization =
    options?.supplyTargetUtilization?.[marketId] ??
    options?.defaultSupplyTargetUtilization ??
    DEFAULT_SUPPLY_TARGET_UTILIZATION;

  // Shared-liquidity reallocation only triggers once the market crosses
  // `supplyTargetUtilization`; below it, only the market's own liquidity applies.
  if (supplyTargetUtilization > targetUtilization) return ownHeadroom;

  // Pass the caller's options through unchanged (no forced 100% drain).
  const sharedLiquidity = computeAvailableSharedLiquidity({
    reallocationData,
    marketId,
    options,
  });

  // At its current utilization the market has no own headroom left; only shared
  // liquidity can back further borrow while holding utilization steady.
  if (targetUtilization === market.utilization) return sharedLiquidity;

  return ownHeadroom + sharedLiquidity;
};

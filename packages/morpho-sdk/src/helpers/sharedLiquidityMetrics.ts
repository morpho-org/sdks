import type { MarketId } from "@morpho-org/blue-sdk";
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

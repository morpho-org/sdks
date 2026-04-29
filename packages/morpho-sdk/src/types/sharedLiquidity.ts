import type { MarketId, MarketParams } from "@morpho-org/blue-sdk";
import type { PublicAllocatorOptions } from "@morpho-org/simulation-sdk";
import type { Address } from "viem";

/** A single withdrawal from a source market within a vault reallocation. */
export interface ReallocationWithdrawal {
  readonly marketParams: MarketParams;
  readonly amount: bigint;
}

/**
 * A computed reallocation for a single vault.
 *
 * Maps 1:1 to a `PublicAllocator.reallocateTo()` call.
 * Withdraws from source markets and supplies to the target market.
 */
export interface VaultReallocation {
  readonly vault: Address;
  /** Fee in native token (ETH) paid to the PublicAllocator for this vault. */
  readonly fee: bigint;
  /** Source markets to withdraw from before supplying to the target market. */
  readonly withdrawals: readonly ReallocationWithdrawal[];
}

/**
 * Options for computing vault reallocations via the public allocator.
 *
 * Extends {@link PublicAllocatorOptions} with supply-side utilization targets
 * that determine when reallocation is triggered.
 */
export interface ReallocationComputeOptions extends PublicAllocatorOptions {
  /**
   * Per-market target utilization above which the shared liquidity algorithm
   * is triggered (scaled by WAD). Overrides `defaultSupplyTargetUtilization`
   * for the specified market.
   */
  readonly supplyTargetUtilization?: Record<MarketId, bigint | undefined>;

  /**
   * The default target utilization above which the shared liquidity algorithm
   * is triggered (scaled by WAD).
   * @default 90.5% (905000000000000000n)
   */
  readonly defaultSupplyTargetUtilization?: bigint;
}

import type {
  BigIntish,
  Holding,
  Market,
  MarketId,
  MarketParams,
  Position,
  Vault,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/**
 * Minimal block reference used to fetch reallocation data at a consistent state.
 */
export interface MinimalBlock {
  /** Block number used for RPC reads. */
  readonly number: bigint;

  /** Block timestamp used for market accrual and allocator-delay calculations. */
  readonly timestamp: bigint;
}

/**
 * Options controlling public allocator withdrawal discovery.
 */
export interface PublicAllocatorOptions {
  /** Whether public allocator reallocation discovery is enabled. */
  readonly enabled?: boolean;

  /**
   * Timestamp at which market interest and public allocator pending caps are evaluated.
   * Defaults to the target market's last update timestamp.
   */
  readonly timestamp?: BigIntish;

  /**
   * Vaults to consider for reallocation. They must have enabled the PublicAllocator.
   * Defaults to all vaults present in the reallocation data.
   */
  readonly reallocatableVaults?: readonly Address[];

  /**
   * The maximum utilization each source market may reach when withdrawing
   * shared liquidity, scaled by WAD.
   */
  readonly maxWithdrawalUtilization?: Readonly<
    Record<MarketId, bigint | undefined>
  >;

  /**
   * The default maximum utilization source markets may reach when withdrawing
   * shared liquidity, scaled by WAD.
   * @default 92% (920000000000000000n)
   */
  readonly defaultMaxWithdrawalUtilization?: bigint;

  /**
   * Delay to consider between computing reallocations and committing them onchain.
   * @default 1 hour
   */
  readonly delay?: bigint;
}

/**
 * A computed source-market withdrawal before it is grouped by vault.
 */
export interface PublicReallocation {
  /** Source market id to withdraw from. */
  readonly id: MarketId;

  /** Vault that can perform the public allocator reallocation. */
  readonly vault: Address;

  /** Assets to withdraw from the source market. */
  readonly assets: bigint;
}

/**
 * Input state required by {@link ReallocationData} to compute reallocations.
 */
export interface InputReallocationData {
  /** Chain id associated with the fetched state. */
  readonly chainId: number;

  /** Markets indexed by market id. */
  readonly markets?: Readonly<Record<MarketId, Market | undefined>>;

  /** Vaults indexed by vault address. */
  readonly vaults?: Readonly<Record<Address, Vault | undefined>>;

  /** Positions indexed by user or vault address, then by market id. */
  readonly positions?: Readonly<
    Record<Address, Readonly<Record<MarketId, Position | undefined>>>
  >;

  /** Holdings indexed by user or vault address, then by token address. */
  readonly holdings?: Readonly<
    Record<Address, Readonly<Record<Address, Holding | undefined>>>
  >;

  /** Vault market configs indexed by vault address, then by market id. */
  readonly vaultMarketConfigs?: Readonly<
    Record<Address, Readonly<Record<MarketId, VaultMarketConfig | undefined>>>
  >;
}

/** A single withdrawal from a source market within a vault reallocation. */
export interface ReallocationWithdrawal {
  /** Source market parameters to pass to the public allocator. */
  readonly marketParams: MarketParams;

  /** Asset amount to withdraw from the source market. */
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
  readonly supplyTargetUtilization?: Readonly<
    Record<MarketId, bigint | undefined>
  >;

  /**
   * The default target utilization above which the shared liquidity algorithm
   * is triggered (scaled by WAD).
   * @default 90.5% (905000000000000000n)
   */
  readonly defaultSupplyTargetUtilization?: bigint;
}

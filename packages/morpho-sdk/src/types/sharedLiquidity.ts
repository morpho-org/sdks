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

export interface MinimalBlock {
  readonly number: bigint;
  readonly timestamp: bigint;
}

export interface PublicAllocatorOptions {
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

export interface PublicReallocation {
  readonly id: MarketId;
  readonly vault: Address;
  readonly assets: bigint;
}

export interface InputReallocationData {
  readonly chainId: number;
  readonly markets?: Readonly<Record<MarketId, Market | undefined>>;
  readonly vaults?: Readonly<Record<Address, Vault | undefined>>;
  readonly positions?: Readonly<
    Record<Address, Readonly<Record<MarketId, Position | undefined>>>
  >;
  readonly holdings?: Readonly<
    Record<Address, Readonly<Record<Address, Holding | undefined>>>
  >;
  readonly vaultMarketConfigs?: Readonly<
    Record<Address, Readonly<Record<MarketId, VaultMarketConfig | undefined>>>
  >;
}

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

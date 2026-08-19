import type { BigIntish, MarketId, MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

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
   * Arrays, readonly arrays, sets, and other iterables are accepted.
   * Defaults to all vaults present in the reallocation data.
   */
  readonly reallocatableVaults?: Iterable<Address>;

  /**
   * The maximum utilization each source market may reach when withdrawing
   * shared liquidity, scaled by WAD.
   *
   * @deprecated Per-market source ceilings will be removed in the next major.
   * Use `defaultMaxWithdrawalUtilization` to configure one ceiling for every source.
   */
  readonly maxWithdrawalUtilization?: Readonly<
    Record<MarketId, bigint | undefined>
  >;

  /**
   * The default maximum utilization source markets may reach when withdrawing
   * shared liquidity, scaled by WAD.
   *
   * @default 90% (900000000000000000n)
   */
  readonly defaultMaxWithdrawalUtilization?: bigint;
}

/** Options controlling Vault V2 BluePublicAllocator reallocation discovery. */
export interface VaultV2BluePublicAllocatorOptions {
  /** Whether Vault V2 public allocator discovery is enabled. */
  readonly enabled?: boolean;

  /** Timestamp at which market and Vault V2 interest is evaluated. */
  readonly timestamp?: BigIntish;

  /**
   * Vault V2 addresses to consider. Arrays, readonly arrays, sets, and other
   * iterables are accepted. Defaults to every vault in the reallocation data.
   */
  readonly reallocatableVaults?: Iterable<Address>;

  /**
   * Maximum utilization source markets may reach during friendly discovery,
   * scaled by WAD. The amount-aware planner falls back to 100% only when the
   * friendly phase cannot cover the operation's absolute shortfall.
   *
   * @default 90% (900000000000000000n)
   */
  readonly maxWithdrawalUtilization?: bigint;

  /**
   * Maximum proportional vault-asset penalty accepted for each
   * BluePublicAllocator call, scaled by WAD. Vaults with a higher configured
   * penalty are ignored. Defaults to no limit.
   */
  readonly maxPenalty?: bigint;
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
export interface VaultV1Reallocation {
  readonly vault: Address;
  /** Fee in native token (ETH) paid to the PublicAllocator for this vault. */
  readonly fee: bigint;
  /** Source markets to withdraw from before supplying to the target market. */
  readonly withdrawals: readonly ReallocationWithdrawal[];
}

/** Source of a Vault V2 BluePublicAllocator reallocation. */
export type VaultV2BlueReallocationSource =
  | {
      /** Reallocate from a Morpho Blue market. */
      readonly type: "market";
      /** Vault V2 adapter supplying the source market. */
      readonly adapter: Address;
      /** Source market parameters. */
      readonly marketParams: MarketParams;
    }
  | {
      /** Allocate from vault idle liquidity without a synthetic market. */
      readonly type: "idle";
    };

/**
 * One Blue Public Allocator contract call performed before a Blue action.
 *
 * The target market parameters are derived from the enclosing Blue action.
 */
export interface VaultV2BlueReallocation {
  /** Vault whose liquidity is moved. */
  readonly vault: Address;
  /** Liquidity source. */
  readonly from: VaultV2BlueReallocationSource;
  /** Target Vault V2 adapter; the target market comes from the enclosing action. */
  readonly to: { readonly adapter: Address };
  /** Asset amount, which must fit in `uint128`. */
  readonly assets: bigint;
  /** Vault-configured WAD-scaled penalty rate passed to the allocator. */
  readonly penalty: bigint;
}

/**
 * Reallocation accepted by Blue actions that support PublicAllocator V1 or BluePublicAllocator.
 *
 * V1 entries are identified by `withdrawals`; V2 entries are identified by
 * `from`.
 */
export type BlueReallocation = VaultV1Reallocation | VaultV2BlueReallocation;

/**
 * Deprecated name for a Vault V1 reallocation.
 *
 * @deprecated Use {@link VaultV1Reallocation} instead.
 */
export type VaultReallocation = VaultV1Reallocation;

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
   *
   * @deprecated The supply-target trigger is fixed at 90%
   * ({@link DEFAULT_SUPPLY_TARGET_UTILIZATION}) and will stop being configurable
   * in the next major. Per-market overrides are still honored for now.
   */
  readonly supplyTargetUtilization?: Readonly<
    Record<MarketId, bigint | undefined>
  >;

  /**
   * The default target utilization above which the shared liquidity algorithm
   * is triggered (scaled by WAD).
   *
   * @default 90% (900000000000000000n)
   * @deprecated The supply-target trigger is fixed at 90%
   * ({@link DEFAULT_SUPPLY_TARGET_UTILIZATION}) and will stop being configurable
   * in the next major. Overrides are still honored for now.
   */
  readonly defaultSupplyTargetUtilization?: bigint;
}

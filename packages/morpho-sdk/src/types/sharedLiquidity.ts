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
   * @deprecated The source-market withdrawal ceiling is fixed at 90%
   * ({@link DEFAULT_WITHDRAWAL_TARGET_UTILIZATION}) and will stop being
   * configurable in the next major. Per-market overrides are still honored for now.
   */
  readonly maxWithdrawalUtilization?: Readonly<
    Record<MarketId, bigint | undefined>
  >;

  /**
   * The default maximum utilization source markets may reach when withdrawing
   * shared liquidity, scaled by WAD.
   *
   * @default 90% (900000000000000000n)
   * @deprecated The source-market withdrawal ceiling is fixed at 90%
   * ({@link DEFAULT_WITHDRAWAL_TARGET_UTILIZATION}) and will stop being
   * configurable in the next major. Overrides are still honored for now.
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
export interface VaultV1BlueReallocation {
  /** Optional discriminator; omitted by legacy Public Allocator V1 callers. */
  readonly type?: "publicAllocatorV1";
  readonly vault: Address;
  /** Fee in native token (ETH) paid to the PublicAllocator for this vault. */
  readonly fee: bigint;
  /** Source markets to withdraw from before supplying to the target market. */
  readonly withdrawals: readonly ReallocationWithdrawal[];
}

/** Source of a Blue Public Allocator reallocation. */
export type BluePublicAllocatorSource =
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
  /** Explicit allocator contract address because BluePublicAllocator has no deployment registry entry. */
  readonly allocator: Address;
  /** Discriminator separating BluePublicAllocator reallocations from PublicAllocator V1 reallocations. */
  readonly type: "bluePublicAllocator";
  /** Vault whose liquidity is moved. */
  readonly vault: Address;
  /** Liquidity source. */
  readonly from: BluePublicAllocatorSource;
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
 * V1 entries remain valid without a `type` field and may optionally use
 * `type: "publicAllocatorV1"`; Blue Public Allocator entries use
 * `type: "bluePublicAllocator"`.
 */
export type BlueReallocation =
  | VaultV1BlueReallocation
  | VaultV2BlueReallocation;

/**
 * Deprecated name for a Vault V1 Blue reallocation.
 *
 * @deprecated Use {@link VaultV1BlueReallocation} instead.
 */
export type VaultReallocation = VaultV1BlueReallocation;

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

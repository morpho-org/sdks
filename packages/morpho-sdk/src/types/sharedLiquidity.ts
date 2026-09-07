import type { BigIntish, MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

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
   * penalty are ignored. Must not exceed WAD (100%).
   *
   * @default 0n
   */
  readonly maxPenalty?: bigint;
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

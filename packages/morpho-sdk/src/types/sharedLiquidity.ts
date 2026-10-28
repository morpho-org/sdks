import type { BigIntish, MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/** Options controlling Vault V2 BluePublicAllocator reallocation discovery. */
export interface VaultV2BluePublicAllocatorOptions {
  /** Whether Vault V2 public allocator discovery is enabled. */
  readonly enabled?: boolean;

  /**
   * Timestamp at which market and Vault V2 state is evaluated. Defaults to the
   * snapshot's timestamp (the fetched block's timestamp), never earlier than
   * the latest market/vault `lastUpdate`; when the snapshot has no timestamp,
   * defaults to the latest market/vault `lastUpdate`. Canonical state and the
   * returned post-state stay at this timestamp; only target-market cap checks
   * reserve interest on the vault's existing allocation through this timestamp
   * plus `capAccrualBuffer`. For market-source reallocations the source
   * position's interest is also reserved on cap ids shared with the target, and
   * reserves persist across every leg of a plan.
   */
  readonly timestamp?: BigIntish;

  /**
   * Seconds beyond `timestamp` through which target-market cap checks reserve
   * interest on the vault's existing allocation. For market-source
   * reallocations the source position's interest is also reserved on cap ids
   * shared with the target, and reserves persist across every leg of a plan.
   * Market and Vault V2 state, including the returned post-state, stay at
   * `timestamp`. Set to `0n` to disable.
   *
   * @default DEFAULT_CAP_ACCRUAL_BUFFER (2h)
   */
  readonly capAccrualBuffer?: BigIntish;

  /**
   * Share of each target-market BluePublicAllocator cap, scaled by WAD, that
   * operation planning keeps free. When a reallocation toward the utilization
   * target would come within this headroom of the cap, the plan is reduced to
   * the larger of the operation's absolute shortfall and what unbound legs
   * were already moving (legs that neither come within the headroom of an
   * allocator cap nor take nearly all of their source vault's idle). A plan of
   * only the shortfall leaves the market fully utilized, so a competing borrow
   * or withdraw landing first can still make it revert. If the shortfall cannot
   * be covered while keeping the headroom, the plan uses the full cap, first for
   * the shortfall only and then toward the utilization target if that is still
   * short.
   * The same share marks idle legs as bound: idle legs that together leave at
   * most this share of a source vault's starting idle reduce the plan the same
   * way, since any idle withdrawal landing first would make it revert.
   * Discovery plans, `getPublicReallocationLiquidity` and
   * `getAvailableLiquidityToUtilization` ignore it and use the full cap.
   * Must not exceed WAD (100%). Set to `0n` to disable both rules.
   *
   * @default DEFAULT_ALLOCATOR_CAP_HEADROOM (1%)
   */
  readonly allocatorCapHeadroom?: bigint;

  /**
   * Vault V2 addresses to consider. Arrays, readonly arrays, sets, and other
   * iterables are accepted. Defaults to every vault in the reallocation data.
   */
  readonly reallocatableVaults?: Iterable<Address>;

  /**
   * Maximum utilization source markets may reach during friendly discovery,
   * scaled by WAD. Within each penalty tier, the amount-aware planner falls
   * back to 100% only when that tier's friendly pass leaves an absolute
   * shortfall.
   *
   * @default 90% (900000000000000000n)
   */
  readonly maxWithdrawalUtilization?: bigint;

  /**
   * Maximum proportional vault-asset penalty accepted per call, scaled by
   * WAD; higher-penalty vaults are ignored. Must not exceed WAD. Operation
   * plans consider penalty tiers ascending, free first. Each tier uses friendly
   * source utilization (90% by default) before 100%; positive tiers cover only
   * the remaining absolute shortfall. Free capacity inside
   * `allocatorCapHeadroom` stays unused, so a penalized leg can cover it.
   * Getters count all vaults up to this limit. For `refinance`, compute the
   * plan on the destination-market handle (for example,
   * `client.morpho.blue(destination.marketParams, chainId)`), not the source
   * handle. Pass the source position's `borrowAssets` accrued to
   * `max(now, source.lastUpdate, destination.lastUpdate) + 2h` as
   * `operation.amount`; the optional `operation.referralFeePct` is WAD-scaled.
   * The planner includes the referral fee and its own allocator-leg penalties
   * in destination debt, so penalized legs also cover their own penalty.
   * Refinance never uses vaults with a 100% penalty.
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

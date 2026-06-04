import type { BigIntish } from "../types.js";

/**
 * Plain input accepted by {@link MarketState}.
 *
 * @example
 * ```ts
 * import type { IMarketState } from "@morpho-org/midnight-sdk";
 *
 * const state: IMarketState = {
 *   totalUnits: 0n,
 *   lossFactor: 0n,
 *   withdrawable: 0n,
 *   continuousFeeCredit: 0n,
 *   settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
 *   continuousFee: 0,
 *   tickSpacing: 4,
 * };
 * ```
 */
export interface IMarketState {
  /** Total market units. */
  readonly totalUnits: BigIntish;
  /** Current loss factor. */
  readonly lossFactor: BigIntish;
  /** Withdrawable assets. */
  readonly withdrawable: BigIntish;
  /** Continuous-fee credit. */
  readonly continuousFeeCredit: BigIntish;
  /** Seven settlement-fee cbp buckets. */
  readonly settlementFeeCbps: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  /** Continuous fee per second. */
  readonly continuousFee: number;
  /** Market tick spacing. */
  readonly tickSpacing: number;
}

/**
 * Midnight market state.
 *
 * @example
 * ```ts
 * import type { MarketState } from "@morpho-org/midnight-sdk";
 *
 * const state: MarketState = {
 *   totalUnits: 0n,
 *   lossFactor: 0n,
 *   withdrawable: 0n,
 *   continuousFeeCredit: 0n,
 *   settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
 *   continuousFee: 0,
 *   tickSpacing: 4,
 * };
 * console.log(state.tickSpacing);
 * ```
 */
export interface MarketState {
  /** Total market units. */
  readonly totalUnits: bigint;
  /** Current loss factor. */
  readonly lossFactor: bigint;
  /** Withdrawable assets. */
  readonly withdrawable: bigint;
  /** Continuous-fee credit. */
  readonly continuousFeeCredit: bigint;
  /** Seven settlement-fee cbp buckets. */
  readonly settlementFeeCbps: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  /** Continuous fee per second. */
  readonly continuousFee: number;
  /** Market tick spacing. */
  readonly tickSpacing: number;
}

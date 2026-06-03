import { deepFreeze, toBigInt } from "../internal.js";
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
 * Normalized Midnight market state.
 *
 * @example
 * ```ts
 * import { MarketState } from "@morpho-org/midnight-sdk";
 *
 * const state = new MarketState({
 *   totalUnits: 0n,
 *   lossFactor: 0n,
 *   withdrawable: 0n,
 *   continuousFeeCredit: 0n,
 *   settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
 *   continuousFee: 0,
 *   tickSpacing: 4,
 * });
 * console.log(state.tickSpacing);
 * ```
 */
export class MarketState {
  /** Total market units. */
  public readonly totalUnits: bigint;

  /** Current loss factor. */
  public readonly lossFactor: bigint;

  /** Withdrawable assets. */
  public readonly withdrawable: bigint;

  /** Continuous-fee credit. */
  public readonly continuousFeeCredit: bigint;

  /** Seven settlement-fee cbp buckets. */
  public readonly settlementFeeCbps: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  /** Continuous fee per second. */
  public readonly continuousFee: number;

  /** Market tick spacing. */
  public readonly tickSpacing: number;

  public constructor(state: IMarketState) {
    this.totalUnits = toBigInt(state.totalUnits, "totalUnits");
    this.lossFactor = toBigInt(state.lossFactor, "lossFactor");
    this.withdrawable = toBigInt(state.withdrawable, "withdrawable");
    this.continuousFeeCredit = toBigInt(
      state.continuousFeeCredit,
      "continuousFeeCredit",
    );
    this.settlementFeeCbps = deepFreeze([...state.settlementFeeCbps] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]);
    this.continuousFee = state.continuousFee;
    this.tickSpacing = state.tickSpacing;
    deepFreeze(this);
  }
}

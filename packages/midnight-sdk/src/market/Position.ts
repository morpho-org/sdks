import type { BigIntish } from "../types.js";

/**
 * Plain input accepted by {@link Position}.
 *
 * @example
 * ```ts
 * import type { IPosition } from "@morpho-org/midnight-sdk";
 *
 * const position: IPosition = {
 *   credit: 0n,
 *   pendingFee: 0n,
 *   lastLossFactor: 0n,
 *   lastAccrual: 0n,
 *   debt: 0n,
 *   collateralBitmap: 0n,
 *   collateral: Array.from({ length: 128 }, () => 0n),
 * };
 * ```
 */
export interface IPosition {
  /** User credit. */
  readonly credit: BigIntish;
  /** Pending fee. */
  readonly pendingFee: BigIntish;
  /** Last loss factor seen by the position. */
  readonly lastLossFactor: BigIntish;
  /** Last accrual timestamp. */
  readonly lastAccrual: BigIntish;
  /** User debt. */
  readonly debt: BigIntish;
  /** Collateral bitmap. */
  readonly collateralBitmap: BigIntish;
  /** Collateral balances by index. */
  readonly collateral: readonly BigIntish[];
}

/**
 * Midnight user position.
 *
 * @example
 * ```ts
 * import type { Position } from "@morpho-org/midnight-sdk";
 *
 * const position: Position = {
 *   credit: 0n,
 *   pendingFee: 0n,
 *   lastLossFactor: 0n,
 *   lastAccrual: 0n,
 *   debt: 0n,
 *   collateralBitmap: 0n,
 *   collateral: Array.from({ length: 128 }, () => 0n),
 * };
 * console.log(position.debt);
 * ```
 */
export interface Position {
  /** User credit. */
  readonly credit: bigint;
  /** Pending fee. */
  readonly pendingFee: bigint;
  /** Last loss factor seen by the position. */
  readonly lastLossFactor: bigint;
  /** Last accrual timestamp. */
  readonly lastAccrual: bigint;
  /** User debt. */
  readonly debt: bigint;
  /** Collateral bitmap. */
  readonly collateralBitmap: bigint;
  /** Collateral balances by index. */
  readonly collateral: readonly bigint[];
}

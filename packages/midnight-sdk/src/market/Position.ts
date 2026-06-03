import { deepFreeze } from "../internal.js";
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
 * Normalized Midnight user position.
 *
 * @example
 * ```ts
 * import { Position } from "@morpho-org/midnight-sdk";
 *
 * const position = new Position({
 *   credit: 0n,
 *   pendingFee: 0n,
 *   lastLossFactor: 0n,
 *   lastAccrual: 0n,
 *   debt: 0n,
 *   collateralBitmap: 0n,
 *   collateral: Array.from({ length: 128 }, () => 0n),
 * });
 * console.log(position.debt);
 * ```
 */
export class Position {
  /** User credit. */
  public readonly credit: bigint;

  /** Pending fee. */
  public readonly pendingFee: bigint;

  /** Last loss factor seen by the position. */
  public readonly lastLossFactor: bigint;

  /** Last accrual timestamp. */
  public readonly lastAccrual: bigint;

  /** User debt. */
  public readonly debt: bigint;

  /** Collateral bitmap. */
  public readonly collateralBitmap: bigint;

  /** Collateral balances by index. */
  public readonly collateral: readonly bigint[];

  public constructor(position: IPosition) {
    this.credit = BigInt(position.credit);
    this.pendingFee = BigInt(position.pendingFee);
    this.lastLossFactor = BigInt(position.lastLossFactor);
    this.lastAccrual = BigInt(position.lastAccrual);
    this.debt = BigInt(position.debt);
    this.collateralBitmap = BigInt(position.collateralBitmap);
    this.collateral = deepFreeze(
      position.collateral.map((assets) => BigInt(assets)),
    );
    deepFreeze(this);
  }
}

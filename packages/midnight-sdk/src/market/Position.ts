import { type BigIntish, MathLib } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import {
  InvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError,
} from "../errors.js";
import { type IMarket, Market } from "./Market.js";

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
  /** Pending continuous fee. */
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
 * Midnight user position as stored by the core contract.
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
 *   collateral: [],
 * });
 * console.log(position.debt);
 * ```
 */
export class Position {
  /** User credit. */
  public readonly credit: bigint;

  /** Pending continuous fee. */
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
    this.collateral = position.collateral.map((assets) => BigInt(assets));
  }

  /**
   * Returns credit net of pending fee, floored to zero for invalid raw inputs.
   *
   * @returns Credit minus pending fee.
   * @example
   * ```ts
   * import { Position } from "@morpho-org/midnight-sdk";
   *
   * console.log(new Position({} as never).faceValue);
   * ```
   */
  public get faceValue() {
    return MathLib.zeroFloorSub(this.credit, this.pendingFee);
  }
}

/**
 * Midnight position paired with its hydrated market.
 *
 * @example
 * ```ts
 * import { AccrualPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = new AccrualPosition({} as never, {} as never);
 * console.log(position.market.id);
 * ```
 */
export class AccrualPosition extends Position {
  /** Hydrated market for this position. */
  public readonly market: Market;

  public constructor(position: IPosition, market: IMarket) {
    super(position);
    this.market = market instanceof Market ? market : new Market(market);
  }

  /**
   * Returns the position collateral balance at an index configured by the market.
   *
   * @param index - Collateral index.
   * @returns Collateral balance, or undefined when the index is not configured.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * const balance = new AccrualPosition({} as never, {} as never).getCollateralBalanceByIndex(0);
   * console.log(balance);
   * ```
   */
  public getCollateralBalanceByIndex(index: BigIntish) {
    const normalizedIndex = BigInt(index);
    if (this.market.getCollateralParamsByIndex(normalizedIndex) == null)
      return undefined;

    return this.collateral[Number(normalizedIndex)] ?? 0n;
  }

  /**
   * Returns the position collateral balance for a configured token.
   *
   * @param token - Collateral token address.
   * @returns Collateral balance, or undefined when the token is not configured.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * const balance = new AccrualPosition({} as never, {} as never).getCollateralBalanceByToken("0x0000000000000000000000000000000000000001");
   * console.log(balance);
   * ```
   */
  public getCollateralBalanceByToken(token: Address) {
    const index = this.market.getCollateralIndexByToken(token);

    return index == null ? undefined : this.getCollateralBalanceByIndex(index);
  }

  /**
   * Returns the market settlement fee at a timestamp.
   *
   * @param timestamp - Timestamp used to compute time to maturity.
   * @returns WAD-scaled settlement fee.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * const fee = new AccrualPosition({} as never, {} as never).getSettlementFee(0n);
   * console.log(fee);
   * ```
   */
  public getSettlementFee(timestamp: BigIntish) {
    return this.market.getSettlementFee(this.market.timeToMaturity(timestamp));
  }

  /**
   * Returns a new position locally accrued like Midnight `updatePositionView`.
   *
   * @param timestamp - Timestamp at which to accrue. Must be greater than or equal to `lastAccrual`.
   * @returns New accrual position with updated credit, pending fee, last loss factor, last accrual, and market continuous-fee credit.
   * @throws {InvalidPositionAccrualTimestampError} when timestamp is before `lastAccrual`.
   * @throws {InvalidPositionLossFactorError} when the market loss factor is older than the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when raw inputs violate Midnight accounting invariants.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/midnight-sdk";
   *
   * const accrued = new AccrualPosition({} as never, {} as never).accrueInterest(0n);
   * console.log(accrued.credit);
   * ```
   */
  public accrueInterest(timestamp: BigIntish) {
    const normalizedTimestamp = BigInt(timestamp);
    if (normalizedTimestamp < this.lastAccrual) {
      throw new InvalidPositionAccrualTimestampError(
        normalizedTimestamp,
        this.lastAccrual,
      );
    }
    if (this.market.lossFactor < this.lastLossFactor) {
      throw new InvalidPositionLossFactorError(
        this.market.lossFactor,
        this.lastLossFactor,
      );
    }
    if (this.pendingFee > this.credit) {
      throw new InvalidPositionAccrualStateError(
        "Pending fee must be less than or equal to credit.",
      );
    }

    const postSlashCredit =
      this.lastLossFactor < MathLib.MAX_UINT_128
        ? MathLib.mulDivDown(
            this.credit,
            MathLib.MAX_UINT_128 - this.market.lossFactor,
            MathLib.MAX_UINT_128 - this.lastLossFactor,
          )
        : 0n;
    if (postSlashCredit > this.credit) {
      throw new InvalidPositionAccrualStateError(
        "Post-slash credit cannot exceed stored credit.",
      );
    }

    const creditDecrease = this.credit - postSlashCredit;
    const pendingFeeDecrease =
      this.credit > 0n
        ? MathLib.mulDivUp(this.pendingFee, creditDecrease, this.credit)
        : 0n;
    if (pendingFeeDecrease > this.pendingFee) {
      throw new InvalidPositionAccrualStateError(
        "Pending-fee decrease cannot exceed pending fee.",
      );
    }

    const postSlashPendingFee = this.pendingFee - pendingFeeDecrease;
    const accrualEnd =
      normalizedTimestamp < this.market.params.maturity
        ? normalizedTimestamp
        : this.market.params.maturity;
    const accruedFee =
      this.lastAccrual < this.market.params.maturity
        ? MathLib.mulDivDown(
            postSlashPendingFee,
            accrualEnd - this.lastAccrual,
            this.market.params.maturity - this.lastAccrual,
          )
        : 0n;
    if (accruedFee > postSlashCredit || accruedFee > postSlashPendingFee) {
      throw new InvalidPositionAccrualStateError(
        "Accrued fee cannot exceed post-slash credit or pending fee.",
      );
    }

    return new AccrualPosition(
      {
        credit: postSlashCredit - accruedFee,
        pendingFee: postSlashPendingFee - accruedFee,
        lastLossFactor: this.market.lossFactor,
        lastAccrual: normalizedTimestamp,
        debt: this.debt,
        collateralBitmap: this.collateralBitmap,
        collateral: this.collateral,
      },
      {
        chainId: this.market.chainId,
        params: this.market.params,
        totalUnits: this.market.totalUnits,
        lossFactor: this.market.lossFactor,
        withdrawable: this.market.withdrawable,
        continuousFeeCredit: this.market.continuousFeeCredit + accruedFee,
        settlementFeeCbps: this.market.settlementFeeCbps,
        continuousFee: this.market.continuousFee,
        tickSpacing: this.market.tickSpacing,
      },
    );
  }
}

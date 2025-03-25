import type { Address } from "viem";
import { ORACLE_PRICE_SCALE } from "../constants";
import {
  type Market,
  MarketUtils,
  type MaxBorrowOptions,
  type MaxWithdrawCollateralOptions,
} from "../market";
import { MathLib, SharesMath } from "../math";
import type { BigIntish } from "../types";
import { AccrualPosition, type IAccrualPosition } from "./Position";

export interface IPreLiquidationParams {
  preLltv: BigIntish;
  preLCF1: BigIntish;
  preLCF2: BigIntish;
  preLIF1: BigIntish;
  preLIF2: BigIntish;
}

export class PreLiquidationParams implements IPreLiquidationParams {
  public readonly preLltv: bigint;
  public readonly preLCF1: bigint;
  public readonly preLCF2: bigint;
  public readonly preLIF1: bigint;
  public readonly preLIF2: bigint;

  constructor({
    preLltv,
    preLCF1,
    preLCF2,
    preLIF1,
    preLIF2,
  }: IPreLiquidationParams) {
    this.preLltv = BigInt(preLltv);
    this.preLCF1 = BigInt(preLCF1);
    this.preLCF2 = BigInt(preLCF2);
    this.preLIF1 = BigInt(preLIF1);
    this.preLIF2 = BigInt(preLIF2);
  }

  public getCloseFactor(quotient: BigIntish) {
    return (
      this.preLCF1 + MathLib.wMulDown(quotient, this.preLCF2 - this.preLCF1)
    );
  }

  public getIncentiveFactor(quotient: BigIntish) {
    return (
      this.preLIF1 + MathLib.wMulDown(quotient, this.preLIF2 - this.preLIF1)
    );
  }
}

export interface IPreLiquidationPosition extends IAccrualPosition {
  /**
   * The pre-liquidation parameters of the associated PreLiquidation contract.
   */
  preLiquidationParams: IPreLiquidationParams;
  /**
   * The address of the PreLiquidation contract this position is associated to.
   */
  preLiquidation: Address;
  /**
   * Whether the PreLiquidation contract is authorized to manage this position.
   */
  isPreLiquidationAuthorized: boolean;
}

export class PreLiquidationPosition
  extends AccrualPosition
  implements IPreLiquidationPosition
{
  public readonly preLiquidationParams: PreLiquidationParams;
  public readonly preLiquidation;
  public readonly isPreLiquidationAuthorized;

  constructor(
    {
      preLiquidationParams,
      preLiquidation,
      isPreLiquidationAuthorized,
      ...position
    }: IPreLiquidationPosition,
    market: Market,
  ) {
    super(position, market);

    this.preLiquidationParams = new PreLiquidationParams(preLiquidationParams);
    this.preLiquidation = preLiquidation;
    this.isPreLiquidationAuthorized = isPreLiquidationAuthorized;
  }

  /**
   * Whether this position is liquidatable via the PreLiquidation contract.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get isPreLiquidatable() {
    const { collateralValue } = this;
    if (collateralValue == null) return;

    const { borrowAssets } = this;

    return (
      this.isPreLiquidationAuthorized &&
      borrowAssets <=
        MathLib.wMulDown(collateralValue, this.market.params.lltv) &&
      borrowAssets >
        MathLib.wMulDown(collateralValue, this.preLiquidationParams.preLltv)
    );
  }

  /**
   * Whether this position is healthy.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get isHealthy() {
    const { isPreLiquidatable } = this;
    if (isPreLiquidatable == null) return isPreLiquidatable;

    const { isLiquidatable } = this;
    if (isLiquidatable == null) return isLiquidatable;

    return !isPreLiquidatable && !isLiquidatable;
  }

  /**
   * The price of the collateral quoted in loan assets that would allow this position to be pre-liquidated.
   * `null` if the position has no borrow.
   */
  get preLiquidationPrice() {
    if (this.borrowShares === 0n || this.market.totalBorrowShares === 0n)
      return null;

    const collateralPower = MarketUtils.getCollateralPower(this.collateral, {
      lltv: this.preLiquidationParams.preLltv,
    });
    if (collateralPower === 0n) return MathLib.MAX_UINT_256;

    const { borrowAssets } = this;

    return MathLib.mulDivUp(borrowAssets, ORACLE_PRICE_SCALE, collateralPower);
  }

  /**
   * The price variation required for the position to reach its pre-liquidation threshold (scaled by WAD).
   * Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
   * `undefined` iff the market's oracle is undefined or reverts.
   * `null` if the position is not a borrow.
   */
  get priceVariationToLiquidationPrice() {
    if (this.market.price == null) return;

    const { preLiquidationPrice } = this;
    if (this.market.price === 0n || preLiquidationPrice == null) return null;

    return MathLib.wDivUp(preLiquidationPrice, this.market.price) - MathLib.WAD;
  }

  /**
   * The maximum amount of loan assets that can be borrowed against this position's collateral.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get maxBorrowAssets() {
    const { collateralValue } = this;
    if (collateralValue == null) return;

    return MathLib.wMulDown(collateralValue, this.preLiquidationParams.preLltv);
  }

  /**
   * The maximum amount of collateral that can be withdrawn.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get withdrawableCollateral() {
    return MarketUtils.getWithdrawableCollateral(this, this.market, {
      lltv: this.preLiquidationParams.preLltv,
    });
  }

  /**
   * The maximum amount of collateral that can be seized in exchange for the outstanding debt in the context of pre-liquidation.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get preSeizableCollateral() {
    if (this.market.price == null) return;

    const { ltv } = this;
    if (ltv == null) return ltv;

    if (!this.isPreLiquidatable) return 0n;

    const quotient = MathLib.wDivDown(
      ltv - this.preLiquidationParams.preLltv,
      this.market.params.lltv - this.preLiquidationParams.preLltv,
    );

    const repayableShares = MathLib.wMulDown(
      this.borrowShares,
      this.preLiquidationParams.getIncentiveFactor(quotient),
    );

    const repayableAssets = MathLib.wMulDown(
      SharesMath.toAssets(
        repayableShares,
        this.market.totalBorrowAssets,
        this.market.totalBorrowShares,
        "Down",
      ),
      this.preLiquidationParams.getIncentiveFactor(quotient),
    );

    return MathLib.mulDivDown(
      repayableAssets,
      ORACLE_PRICE_SCALE,
      this.market.price,
    );
  }

  /**
   * This position's pre health factor (collateral power over debt, scaled by WAD).
   * If the debt is 0, health factor is `MaxUint256`.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get preHealthFactor() {
    return MarketUtils.getHealthFactor(this, this.market, {
      lltv: this.preLiquidationParams.preLltv,
    });
  }

  /**
   * The percentage of this position's borrow power currently used (scaled by WAD).
   * If the collateral price is 0, usage is `MaxUint256`.
   */
  get borrowCapacityUsage() {
    return MarketUtils.getBorrowCapacityUsage(this, this.market, {
      lltv: this.preLiquidationParams.preLltv,
    });
  }

  public getBorrowCapacityLimit(options: MaxBorrowOptions = {}) {
    options.maxLtv =
      options.maxLtv != null
        ? MathLib.min(options.maxLtv, this.preLiquidationParams.preLltv)
        : this.preLiquidationParams.preLltv;

    return this.market.getBorrowCapacityLimit(this, options);
  }

  public getWithdrawCollateralCapacityLimit(
    options: MaxWithdrawCollateralOptions = {},
  ) {
    options.maxLtv =
      options.maxLtv != null
        ? MathLib.min(options.maxLtv, this.preLiquidationParams.preLltv)
        : this.preLiquidationParams.preLltv;

    return this.market.getWithdrawCollateralCapacityLimit(this, options);
  }
}

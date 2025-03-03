import type { Address } from "viem";
import { ORACLE_PRICE_SCALE } from "../constants";
import {
  CapacityLimitReason,
  type Market,
  MarketUtils,
  type MaxBorrowOptions,
  type MaxWithdrawCollateralOptions,
} from "../market";
import { MathLib, SharesMath } from "../math";
import { AccrualPosition, type IAccrualPosition } from "./Position";

export type PreLiquidationParams = {
  preLltv: bigint;
  preLCF1: bigint;
  preLCF2: bigint;
  preLIF1: bigint;
  preLIF2: bigint;
  preLiquidationOracle: Address;
};

export class PreLiquidatablePosition extends AccrualPosition {
  /**
   * The pre-liquidation parameters of the associated PreLiquidation contract.
   */
  public readonly preLiquidationParams: PreLiquidationParams;

  /**
   * The address of the PreLiquidation contract this position is associated to.
   */
  public readonly preLiquidation: Address;

  constructor(
    position: IAccrualPosition,
    market: Market,
    preLiquidationParams: PreLiquidationParams,
    preLiquidation: Address,
  ) {
    super(position, market);

    this.preLiquidationParams = preLiquidationParams;
    this.preLiquidation = preLiquidation;
  }

  /**
   * Whether this position is healthy.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get isLiquidatable() {
    return this.market.isHealthy(this);
  }

  /**
   * Whether this position is liquidatable via the Pre liquidation contract.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get isPreLiquidatable() {
    if (this.ltv === undefined || this.ltv === null) return undefined;

    return (
      this.ltv > this.preLiquidationParams.preLltv &&
      this.ltv < this.market.params.lltv
    );
  }

  /**
   * Whether this position is healthy.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get isHealthy() {
    return !this.isPreLiquidatable && !this.isLiquidatable;
  }

  /**
   * The price of the collateral quoted in loan assets that would allow this position to be pre-liquidated.
   */
  get preLiquidationPrice() {
    if (this.borrowShares === 0n || this.market.totalBorrowShares === 0n)
      return null;

    const collateralPower = MarketUtils.getCollateralPower(this.collateral, {
      lltv: this.market.params.lltv,
    });
    if (collateralPower === 0n) return MathLib.MAX_UINT_256;

    const borrowAssets = MarketUtils.toBorrowAssets(
      this.borrowShares,
      this.market,
    );

    return MathLib.mulDivUp(borrowAssets, ORACLE_PRICE_SCALE, collateralPower);
  }

  /**
   * The price variation required for the position to reach its pre-liquidation threshold (scaled by WAD).
   * Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
   * `undefined` iff the market's oracle is undefined or reverts.
   * Null if the position is not a borrow.
   */
  get priceVariationToLiquidationPrice() {
    if (this.market.price == null) return;

    if (this.market.price === 0n || this.preLiquidationPrice == null)
      return null;

    return (
      MathLib.wDivUp(this.preLiquidationPrice, this.market.price) - MathLib.WAD
    );
  }

  /**
   * The maximum amount of loan assets that can be borrowed against this position's collateral.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get maxBorrowAssets() {
    if (this.collateralValue == null) return;

    return MathLib.wMulDown(
      this.collateralValue,
      this.preLiquidationParams.preLltv,
    );
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
    const ltv = this.ltv;
    if (ltv === undefined || ltv === null || this.market.price === undefined) {
      return undefined;
    }

    if (
      this.borrowAssets > MathLib.wMulDown(this.collateralValue!, ltv) ||
      this.borrowAssets <
        MathLib.wMulDown(
          this.collateralValue!,
          this.preLiquidationParams.preLltv,
        )
    )
      return 0n;

    const quotient = MathLib.wDivDown(
      ltv - this.preLiquidationParams.preLltv,
      this.market.params.lltv - this.preLiquidationParams.preLltv,
    );
    const preLIF =
      this.preLiquidationParams.preLIF1 +
      MathLib.wMulDown(
        quotient,
        this.preLiquidationParams.preLIF2 - this.preLiquidationParams.preLIF1,
      );
    const preLCF =
      this.preLiquidationParams.preLCF1 +
      MathLib.wMulDown(
        quotient,
        this.preLiquidationParams.preLCF2 - this.preLiquidationParams.preLCF1,
      );
    const repayableShares = MathLib.wMulDown(this.borrowShares, preLCF);

    const repayableAssets = MathLib.wMulDown(
      SharesMath.toAssets(
        repayableShares,
        this.market.totalBorrowAssets,
        this.market.totalBorrowShares,
        "Down",
      ),
      preLIF,
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

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position
   * and the reason for the limit.
   * Returns `undefined` iff the market's price is undefined.
   * @deprecated Use `getBorrowCapacityLimit` instead.
   */
  get borrowCapacityLimit() {
    if (this.maxBorrowAssets == null) return;

    // handle edge cases when the user is (pre)liquidatable (maxBorrow < borrow)
    const maxBorrowableAssets = MathLib.zeroFloorSub(
      this.maxBorrowAssets,
      this.market.toBorrowAssets(this.borrowShares),
    );

    const liquidity = this.market.liquidity;

    if (maxBorrowableAssets > liquidity)
      return {
        value: liquidity,
        limiter: CapacityLimitReason.liquidity,
      };

    return {
      value: maxBorrowableAssets,
      limiter: CapacityLimitReason.collateral,
    };
  }

  /**
   * Returns the maximum amount of collateral assets that can be withdrawn given a certain borrow position
   * and the reason for the limit.
   * Returns `undefined` iff the market's price is undefined.
   * @deprecated Use `getWithdrawCollateralCapacityLimit` instead.
   */
  get withdrawCollateralCapacityLimit() {
    const withdrawableCollateral = this.withdrawableCollateral;
    if (withdrawableCollateral == null) return;

    if (this.collateral > withdrawableCollateral)
      return {
        value: withdrawableCollateral,
        limiter: CapacityLimitReason.collateral,
      };

    return {
      value: this.collateral,
      limiter: CapacityLimitReason.position,
    };
  }

  public getBorrowCapacityLimit(options?: MaxBorrowOptions) {
    const maxBorrowAssets = this.market.getMaxBorrowAssets(
      this.collateral,
      options?.maxLtv
        ? {
            maxLtv: MathLib.min(
              options.maxLtv,
              this.preLiquidationParams.preLltv,
            ),
          }
        : {},
    );
    if (maxBorrowAssets == null) return;

    // handle edge cases when the user is liquidatable (maxBorrow < borrow)
    const maxBorrowableAssets = MathLib.zeroFloorSub(
      maxBorrowAssets,
      this.market.toBorrowAssets(this.borrowShares),
    );

    const liquidity = this.market.liquidity;

    if (maxBorrowableAssets > liquidity)
      return {
        value: liquidity,
        limiter: CapacityLimitReason.liquidity,
      };

    return {
      value: maxBorrowableAssets,
      limiter: CapacityLimitReason.collateral,
    };
  }

  public getWithdrawCollateralCapacityLimit(
    options?: MaxWithdrawCollateralOptions,
  ) {
    const withdrawableCollateral = this.market.getWithdrawableCollateral(
      this,
      options?.maxLtv
        ? {
            maxLtv: MathLib.min(
              options.maxLtv,
              this.preLiquidationParams.preLltv,
            ),
          }
        : {},
    );
    if (withdrawableCollateral == null) return;

    if (this.collateral > withdrawableCollateral)
      return {
        value: withdrawableCollateral,
        limiter: CapacityLimitReason.collateral,
      };

    return {
      value: this.collateral,
      limiter: CapacityLimitReason.position,
    };
  }
}

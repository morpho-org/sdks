import { Time, ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { BlueErrors } from "../errors.js";
import {
  AdaptiveCurveIrmLib,
  MathLib,
  type RoundingDirection,
} from "../math/index.js";
import type { BigIntish } from "../types.js";

import type { MarketParams } from "./MarketParams.js";
import { MarketUtils } from "./MarketUtils.js";

export enum CapacityLimitReason {
  liquidity = "Liquidity",
  balance = "Balance",
  position = "Position",
  collateral = "Collateral",
  cap = "Cap",
}

export interface CapacityLimit {
  value: bigint;
  limiter: CapacityLimitReason;
}

export interface MaxBorrowOptions {
  maxLtv?: bigint;
}
export interface MaxWithdrawCollateralOptions {
  maxLtv?: bigint;
}

export interface MaxPositionCapacities {
  supply: CapacityLimit;
  withdraw: CapacityLimit;
  borrow: CapacityLimit | undefined;
  repay: CapacityLimit;
  supplyCollateral: CapacityLimit;
  withdrawCollateral: CapacityLimit | undefined;
}

export interface IMarket {
  params: MarketParams;
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
  price?: bigint;
  rateAtTarget?: bigint;
}

/**
 * Represents a lending market on Morpho Blue.
 */
export class Market implements IMarket {
  /**
   * The market's params.
   */
  public readonly params: MarketParams;

  /**
   * The amount of loan assets supplied in total on the market.
   */
  public totalSupplyAssets: bigint;
  /**
   * The amount of loan assets supplied in total on the market.
   */
  public totalBorrowAssets: bigint;
  /**
   * The amount of loan assets supplied in total on the market.
   */
  public totalSupplyShares: bigint;
  /**
   * The amount of loan assets supplied in total on the market.
   */
  public totalBorrowShares: bigint;

  /**
   * The block timestamp (in __seconds__) when the interest was last accrued.
   */
  public lastUpdate: bigint;
  /**
   * The fee percentage of the market, scaled by WAD.
   */
  public fee: bigint;

  /**
   * The price as returned by the market's oracle.
   * `undefined` if the oracle is undefined or reverts.
   */
  public price?: bigint;

  /**
   * If the market uses the Adaptive Curve IRM, the rate at target utilization.
   * Undefined otherwise.
   */
  public rateAtTarget?: bigint;

  constructor({
    params,
    totalSupplyAssets,
    totalBorrowAssets,
    totalSupplyShares,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
    rateAtTarget,
  }: IMarket) {
    this.params = params;
    this.totalSupplyAssets = totalSupplyAssets;
    this.totalBorrowAssets = totalBorrowAssets;
    this.totalSupplyShares = totalSupplyShares;
    this.totalBorrowShares = totalBorrowShares;
    this.lastUpdate = lastUpdate;
    this.fee = fee;
    this.price = price;

    if (rateAtTarget != null) this.rateAtTarget = rateAtTarget;
  }

  /**
   * The market's hex-encoded id, defined as the hash of the market params.
   */
  get id() {
    return this.params.id;
  }

  /**
   * Whether the market satisfies the canonical definition of an idle market (i.e. collateral token is the zero address).
   */
  get isIdle() {
    return this.params.collateralToken === ZERO_ADDRESS;
  }

  /**
   * @warning Cannot be used to calculate the liquidity available inside a callback,
   * because the balance of Blue may be lower than the market's liquidity due to assets being transferred out prior to the callback.
   */
  get liquidity() {
    return this.totalSupplyAssets - this.totalBorrowAssets;
  }

  /**
   * The market's utilization rate (scaled by WAD).
   */
  get utilization() {
    return MarketUtils.getUtilization(this);
  }

  /**
   * The market's Annual Percentage Yield (APY) at the IRM's target utilization rate, if applicable (scaled by WAD).
   */
  get apyAtTarget() {
    if (this.rateAtTarget == null) return;

    return MarketUtils.compoundRate(this.rateAtTarget);
  }

  /**
   * Returns the rate at which interest accrued for suppliers of this market,
   * since the last time the market was updated (scaled by WAD).
   * @deprecated There's no such thing as a supply rate in Morpho. Only the supply APY is meaningful.
   */
  get supplyRate() {
    return MarketUtils.getSupplyRate(this.borrowRate, this);
  }

  /**
   * Returns the rate at which interest accrues for borrowers of this market,
   * since the last time the market was updated (scaled by WAD).
   * If interested in the rate at a specific timestamp, use `getAccrualBorrowRate(timestamp)` instead.
   */
  get borrowRate() {
    return this.getAccrualBorrowRate();
  }

  /**
   * The market's current, instantaneous supply-side Annual Percentage Yield (APY) (scaled by WAD).
   * If interested in the APY at a specific timestamp, use `getSupplyApy(timestamp)` instead.
   */
  get supplyApy() {
    return this.getSupplyApy();
  }

  /**
   * The market's current, instantaneous borrow-side Annual Percentage Yield (APY) (scaled by WAD).
   * If interested in the APY at a specific timestamp, use `getBorrowApy(timestamp)` instead.
   */
  get borrowApy() {
    return this.getBorrowApy();
  }

  /**
   * Returns the instantaneous rate at which interest accrues for borrowers of this market,
   * at the given timestamp, if the state remains unchanged (not accrued) (scaled by WAD).
   * It is fundamentally different from the rate at which interest is paid by borrowers to lenders in the case of an interest accrual,
   * as in the case of the AdaptiveCurveIRM, the (approximated) average rate since the last update is used instead.
   * @param timestamp The timestamp at which to calculate the borrow rate. Must be greater than or equal to `lastUpdate`. Defaults to `Time.timestamp()` (returns the current borrow rate).
   */
  public getBorrowRate(timestamp: BigIntish = Time.timestamp()) {
    if (this.rateAtTarget == null) return 0n;

    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.lastUpdate;
    if (elapsed < 0n)
      throw new BlueErrors.InvalidInterestAccrual(
        this.id,
        timestamp,
        this.lastUpdate,
      );

    const { endBorrowRate } = AdaptiveCurveIrmLib.getBorrowRate(
      this.utilization,
      this.rateAtTarget,
      elapsed,
    );

    return endBorrowRate;
  }

  /**
   * Returns the rate at which interest accrues for borrowers of this market,
   * at the given timestamp, if the state remains unchanged (not accrued) (scaled by WAD).
   * @param timestamp The timestamp at which to calculate the accrual borrow rate. Must be greater than or equal to `lastUpdate`. Defaults to `Time.timestamp()` (returns the current borrow rate).
   */
  public getAccrualBorrowRate(timestamp: BigIntish = Time.timestamp()) {
    if (this.rateAtTarget == null) return 0n;

    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.lastUpdate;
    if (elapsed < 0n)
      throw new BlueErrors.InvalidInterestAccrual(
        this.id,
        timestamp,
        this.lastUpdate,
      );

    const { avgBorrowRate } = AdaptiveCurveIrmLib.getBorrowRate(
      this.utilization,
      this.rateAtTarget,
      elapsed,
    );

    return avgBorrowRate;
  }

  /**
   * The market's instantaneous borrow-side Annual Percentage Yield (APY) at the given timestamp,
   * if the state remains unchanged (not accrued) (scaled by WAD).
   * @param timestamp The timestamp at which to calculate the borrow APY. Must be greater than or equal to `lastUpdate`. Defaults to `Time.timestamp()` (returns the current borrow APY).
   */
  public getBorrowApy(timestamp: BigIntish = Time.timestamp()) {
    const borrowRate = this.getBorrowRate(timestamp);

    return MarketUtils.compoundRate(borrowRate);
  }

  /**
   * The market's instantaneous supply-side Annual Percentage Yield (APY) at the given timestamp,
   * if the state remains unchanged (not accrued) (scaled by WAD).
   * @param timestamp The timestamp at which to calculate the supply APY. Must be greater than or equal to `lastUpdate`. Defaults to `Time.timestamp()` (returns the current supply APY).
   */
  public getSupplyApy(timestamp: BigIntish = Time.timestamp()) {
    const borrowApy = this.getBorrowApy(timestamp);

    return MathLib.wMulUp(
      MathLib.wMulDown(borrowApy, this.utilization),
      MathLib.WAD - this.fee,
    );
  }

  /**
   * Returns a new market derived from this market, whose interest has been accrued up to the given timestamp.
   * @param timestamp The timestamp at which to accrue interest. Must be greater than or equal to `lastUpdate`. Defaults to `lastUpdate` (returns a copy of the market).
   */
  public accrueInterest(timestamp: BigIntish = this.lastUpdate) {
    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.lastUpdate;
    if (elapsed < 0n)
      throw new BlueErrors.InvalidInterestAccrual(
        this.id,
        timestamp,
        this.lastUpdate,
      );

    if (elapsed === 0n) return new Market(this);

    let borrowRate = 0n;
    let { rateAtTarget } = this;
    if (rateAtTarget != null) {
      const { avgBorrowRate, endRateAtTarget } =
        AdaptiveCurveIrmLib.getBorrowRate(
          this.utilization,
          rateAtTarget,
          elapsed,
        );

      borrowRate = avgBorrowRate;
      rateAtTarget = endRateAtTarget;
    }

    const { interest, feeShares } = MarketUtils.getAccruedInterest(
      borrowRate,
      this,
      elapsed,
    );

    return new Market({
      ...this,
      totalSupplyAssets: this.totalSupplyAssets + interest,
      totalBorrowAssets: this.totalBorrowAssets + interest,
      totalSupplyShares: this.totalSupplyShares + feeShares,
      lastUpdate: timestamp,
      rateAtTarget,
    });
  }

  public supply(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if (assets === 0n && shares === 0n)
      throw new BlueErrors.InconsistentInput();

    const market = this.accrueInterest(timestamp);

    if (shares === 0n) shares = market.toSupplyShares(assets, "Down");
    else assets = market.toSupplyAssets(shares, "Up");

    market.totalSupplyAssets += assets;
    market.totalSupplyShares += shares;

    return { market, assets, shares };
  }

  public withdraw(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if (assets === 0n && shares === 0n)
      throw new BlueErrors.InconsistentInput();

    const market = this.accrueInterest(timestamp);

    if (shares === 0n) shares = market.toSupplyShares(assets, "Up");
    else assets = market.toSupplyAssets(shares, "Down");

    market.totalSupplyAssets -= assets;
    market.totalSupplyShares -= shares;

    if (market.totalBorrowAssets > market.totalSupplyAssets)
      throw new BlueErrors.InsufficientLiquidity(market.id);

    return { market, assets, shares };
  }

  public borrow(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if (assets === 0n && shares === 0n)
      throw new BlueErrors.InconsistentInput();

    const market = this.accrueInterest(timestamp);

    if (shares === 0n) shares = market.toBorrowShares(assets, "Up");
    else assets = market.toBorrowAssets(shares, "Down");

    market.totalBorrowAssets += assets;
    market.totalBorrowShares += shares;

    if (market.totalBorrowAssets > market.totalSupplyAssets)
      throw new BlueErrors.InsufficientLiquidity(market.id);

    return { market, assets, shares };
  }

  public repay(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if (assets === 0n && shares === 0n)
      throw new BlueErrors.InconsistentInput();

    const market = this.accrueInterest(timestamp);

    if (shares === 0n) shares = market.toBorrowShares(assets, "Down");
    else assets = market.toBorrowAssets(shares, "Up");

    market.totalBorrowAssets -= assets;
    market.totalBorrowShares -= shares;

    return { market, assets, shares };
  }

  /**
   * Converts a given amount of supply shares into supply loan assets.
   * @param shares The amount of shares to convert.
   * @param rounding The rounding direction to use (defaults to "Down").
   */
  public toSupplyAssets(shares: bigint, rounding?: RoundingDirection) {
    return MarketUtils.toSupplyAssets(shares, this, rounding);
  }

  /**
   * Converts a given amount of supply loan assets into supply shares.
   * @param shares The amount of assets to convert.
   * @param rounding The rounding direction to use (defaults to "Up").
   */
  public toSupplyShares(assets: bigint, rounding?: RoundingDirection) {
    return MarketUtils.toSupplyShares(assets, this, rounding);
  }

  /**
   * Converts a given amount of borrow shares into borrow loan assets.
   * @param shares The amount of shares to convert.
   * @param rounding The rounding direction to use (defaults to "Up").
   */
  public toBorrowAssets(shares: bigint, rounding?: RoundingDirection) {
    return MarketUtils.toBorrowAssets(shares, this, rounding);
  }

  /**
   * Converts a given amount of borrow loan assets into borrow shares.
   * @param shares The amount of assets to convert.
   * @param rounding The rounding direction to use (defaults to "Down").
   */
  public toBorrowShares(assets: bigint, rounding?: RoundingDirection) {
    return MarketUtils.toBorrowShares(assets, this, rounding);
  }

  /**
   * Returns the smallest volume to supply until the market gets the closest to the given utilization rate.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  public getSupplyToUtilization(utilization: bigint) {
    return MarketUtils.getSupplyToUtilization(this, utilization);
  }

  /**
   * Returns the liquidity available to withdraw until the market gets the closest to the given utilization rate.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  public getWithdrawToUtilization(utilization: bigint) {
    return MarketUtils.getWithdrawToUtilization(this, utilization);
  }

  /**
   * Returns the liquidity available to borrow until the market gets the closest to the given utilization rate.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  public getBorrowToUtilization(utilization: bigint) {
    return MarketUtils.getBorrowToUtilization(this, utilization);
  }

  /**
   * Returns the smallest volume to repay until the market gets the closest to the given utilization rate.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  public getRepayToUtilization(utilization: bigint) {
    return MarketUtils.getRepayToUtilization(this, utilization);
  }

  /**
   * Returns the value of a given amount of collateral quoted in loan assets.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param collateral The amount of collateral to quote.
   */
  public getCollateralValue(collateral: bigint) {
    return MarketUtils.getCollateralValue(collateral, this);
  }

  /**
   * Returns the maximum debt allowed given a certain amount of collateral.
   * `undefined` iff the market's oracle is undefined or reverts.
   * To calculate the amount of loan assets that can be borrowed, use `getMaxBorrowableAssets`.
   * @param collateral The amount of collateral to consider.
   */
  public getMaxBorrowAssets(
    collateral: bigint,
    { maxLtv = this.params.lltv }: MaxBorrowOptions = {},
  ) {
    return MarketUtils.getMaxBorrowAssets(collateral, this, {
      lltv: MathLib.min(maxLtv, this.params.lltv),
    });
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param position The borrow position to consider.
   */
  public getMaxBorrowableAssets(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getMaxBorrowableAssets(position, this, this.params);
  }

  /**
   * Returns the amount of collateral that would be seized in a liquidation given a certain amount of repaid shares.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param repaidShares The amount of shares hypothetically repaid.
   */
  public getLiquidationSeizedAssets(repaidShares: bigint) {
    return MarketUtils.getLiquidationSeizedAssets(
      repaidShares,
      this,
      this.params,
    );
  }

  /**
   * Returns the amount of borrow shares that would be repaid in a liquidation given a certain amount of seized collateral.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param seizedAssets The amount of collateral hypothetically seized.
   */
  public getLiquidationRepaidShares(seizedAssets: bigint) {
    return MarketUtils.getLiquidationRepaidShares(
      seizedAssets,
      this,
      this.params,
    );
  }

  /**
   * Returns the maximum amount of collateral that is worth being seized in a liquidation given a certain borrow position.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param position The borrow position to consider.
   */
  public getSeizableCollateral(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getSeizableCollateral(position, this, this.params);
  }

  /**
   * Returns the amount of collateral that can be withdrawn given a certain borrow position.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param position The borrow position to consider.
   */
  public getWithdrawableCollateral(
    position: {
      collateral: bigint;
      borrowShares: bigint;
    },
    { maxLtv = this.params.lltv }: MaxWithdrawCollateralOptions = {},
  ) {
    return MarketUtils.getWithdrawableCollateral(position, this, {
      lltv: MathLib.min(maxLtv, this.params.lltv),
    });
  }

  /**
   * Returns whether a given borrow position is healthy.
   * `undefined` iff the market's oracle is undefined or reverts.
   * @param position The borrow position to check.
   */
  public isHealthy(position: { collateral: bigint; borrowShares: bigint }) {
    return MarketUtils.isHealthy(position, this, this.params);
  }

  /**
   * Returns the liquidation price of a given borrow position.
   * @param position The borrow position to consider.
   */
  public getLiquidationPrice(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getLiquidationPrice(position, this, this.params);
  }

  /**
   * Returns the price variation required for the given position to reach its liquidation threshold (scaled by WAD).
   * Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
   * Returns `undefined` iff the market's price is undefined.
   * Returns null if the position is not a borrow.
   * @param position The borrow position to consider.
   */
  public getPriceVariationToLiquidationPrice(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getPriceVariationToLiquidationPrice(
      position,
      this,
      this.params,
    );
  }

  /**
   * Returns the health factor of a given borrow position (scaled by WAD).
   * @param position The borrow position to consider.
   */
  public getHealthFactor(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getHealthFactor(position, this, this.params);
  }

  /**
   * Returns the loan-to-value ratio of a given borrow position (scaled by WAD).
   * @param position The borrow position to consider.
   */
  public getLtv(position: { collateral: bigint; borrowShares: bigint }) {
    return MarketUtils.getLtv(position, this);
  }

  /**
   * Returns the usage ratio of the maximum borrow capacity given a certain borrow position (scaled by WAD).
   * @param position The borrow position to consider.
   */
  public getBorrowCapacityUsage(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getBorrowCapacityUsage(position, this, this.params);
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position
   * and the reason for the limit.
   * Returns `undefined` iff the market's price is undefined.
   * @param position The borrow position to consider.
   */
  public getBorrowCapacityLimit(
    {
      collateral,
      borrowShares = 0n,
    }: {
      collateral: bigint;
      borrowShares?: bigint;
    },
    options?: MaxBorrowOptions,
  ): CapacityLimit | undefined {
    const maxBorrowAssets = this.getMaxBorrowAssets(collateral, options);
    if (maxBorrowAssets == null) return;

    // handle edge cases when the user is liquidatable (maxBorrow < borrow)
    const maxBorrowableAssets = MathLib.zeroFloorSub(
      maxBorrowAssets,
      this.toBorrowAssets(borrowShares),
    );

    const { liquidity } = this;

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
   * Returns the maximum amount of loan assets that can be repaid given a certain borrow position
   * and a balance of loan assets, and the reason for the limit.
   * @param position The borrow position to consider.
   */
  public getRepayCapacityLimit(
    borrowShares: bigint,
    loanTokenBalance: bigint,
  ): CapacityLimit {
    const borrowAssets = this.toBorrowAssets(borrowShares);

    if (borrowAssets > loanTokenBalance)
      return {
        value: loanTokenBalance,
        limiter: CapacityLimitReason.balance,
      };

    return {
      value: borrowAssets,
      limiter: CapacityLimitReason.position,
    };
  }

  /**
   * Returns the maximum amount of loan assets that can be withdrawn given a certain supply position
   * and a balance of loan assets, and the reason for the limit.
   * @param position The supply position to consider.
   */
  public getWithdrawCapacityLimit({
    supplyShares,
  }: {
    supplyShares: bigint;
  }): CapacityLimit {
    const supplyAssets = this.toSupplyAssets(supplyShares);
    const { liquidity } = this;

    if (supplyAssets > liquidity)
      return {
        value: liquidity,
        limiter: CapacityLimitReason.liquidity,
      };

    return {
      value: supplyAssets,
      limiter: CapacityLimitReason.position,
    };
  }

  /**
   * Returns the maximum amount of collateral assets that can be withdrawn given a certain borrow position
   * and the reason for the limit.
   * Returns `undefined` iff the market's price is undefined.
   * @param position The borrow position to consider.
   */
  public getWithdrawCollateralCapacityLimit(
    position: {
      collateral: bigint;
      borrowShares: bigint;
    },
    options?: MaxWithdrawCollateralOptions,
  ): CapacityLimit | undefined {
    const withdrawableCollateral = this.getWithdrawableCollateral(
      position,
      options,
    );
    if (withdrawableCollateral == null) return;

    if (position.collateral > withdrawableCollateral)
      return {
        value: withdrawableCollateral,
        limiter: CapacityLimitReason.collateral,
      };

    return {
      value: position.collateral,
      limiter: CapacityLimitReason.position,
    };
  }

  /**
   * Returns the maximum capacity for all interactions with Morpho Blue given a certain position
   * and loan and collateral balances.
   * @param position The position to consider.
   * @param loanTokenBalance The balance of loan assets.
   * @param collateralTokenBalance The balance of collateral assets.
   */
  public getMaxCapacities(
    position: {
      collateral: bigint;
      supplyShares: bigint;
      borrowShares: bigint;
    },
    loanTokenBalance: bigint,
    collateralTokenBalance: bigint,
    options?: {
      borrow?: MaxBorrowOptions;
      withdrawCollateral?: MaxWithdrawCollateralOptions;
    },
  ): MaxPositionCapacities {
    return {
      supply: {
        value: loanTokenBalance,
        limiter: CapacityLimitReason.balance,
      },
      withdraw: this.getWithdrawCapacityLimit(position),
      borrow: this.getBorrowCapacityLimit(position, options?.borrow),
      repay: this.getRepayCapacityLimit(
        position.borrowShares,
        loanTokenBalance,
      ),
      supplyCollateral: {
        value: collateralTokenBalance,
        limiter: CapacityLimitReason.balance,
      },
      withdrawCollateral: this.getWithdrawCollateralCapacityLimit(
        position,
        options?.withdrawCollateral,
      ),
    };
  }
}

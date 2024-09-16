import { BlueErrors } from "../errors";
import { AdaptiveCurveIrmLib, MathLib, RoundingDirection } from "../maths";
import { BigIntish } from "../types";

import { MarketConfig } from "./MarketConfig";
import { MarketUtils } from "./MarketUtils";

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

export interface MaxCapacitiesOptions {
  borrow?: { maxLtv?: bigint };
  withdrawCollateral?: { maxLtv?: bigint };
}

export interface MaxPositionCapacities {
  supply: CapacityLimit;
  withdraw: CapacityLimit;
  borrow: CapacityLimit;
  repay: CapacityLimit;
  supplyCollateral: CapacityLimit;
  withdrawCollateral: CapacityLimit;
}

export interface InputMarket {
  config: MarketConfig;
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
  price: bigint;
  rateAtTarget?: bigint;
}

/**
 * Represents a lending market on Morpho Blue.
 */
export class Market implements InputMarket {
  /**
   * The market's config.
   */
  public readonly config: MarketConfig;

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
   */
  public price: bigint;

  /**
   * If the market uses the Adaptive Curve IRM, the rate at target utilization.
   * Undefined otherwise.
   */
  public rateAtTarget?: bigint;

  constructor({
    config,
    totalSupplyAssets,
    totalBorrowAssets,
    totalSupplyShares,
    totalBorrowShares,
    lastUpdate,
    fee,
    price,
    rateAtTarget,
  }: InputMarket) {
    this.config = config;
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
    return this.config.id;
  }

  /**
   * Whether the market satisfies the canonical definition of an idle market (i.e. collateral token is the zero address).
   */
  get isIdle() {
    return (
      this.config.collateralToken ===
      "0x0000000000000000000000000000000000000000"
    );
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

    return MarketUtils.getApy(this.rateAtTarget);
  }

  /**
   * Returns the rate at which interest accrued on average for suppliers of this market,
   * since the last time the market was updated (scaled by WAD).
   */
  get supplyRate() {
    return MarketUtils.getSupplyRate(this.borrowRate, this);
  }

  /**
   * Returns the rate at which interest accrued on average for borrowers of this market,
   * since the last time the market was updated (scaled by WAD).
   */
  get borrowRate() {
    if (this.rateAtTarget == null) return 0n;

    return AdaptiveCurveIrmLib.getBorrowRate(
      this.utilization,
      this.rateAtTarget,
      0n,
    ).avgBorrowRate;
  }

  /**
   * The market's supply Annual Percentage Yield (APY) (scaled by WAD).
   */
  get supplyApy() {
    return MarketUtils.getApy(this.supplyRate);
  }

  /**
   * The market's borrow Annual Percentage Yield (APY) (scaled by WAD).
   */
  get borrowApy() {
    return MarketUtils.getApy(this.borrowRate);
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
   * @param collateral The amount of collateral to quote.
   */
  public getCollateralValue(collateral: bigint) {
    return MarketUtils.getCollateralValue(collateral, this);
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain amount of collateral.
   * @param collateral The amount of collateral to consider.
   */
  public getMaxBorrowAssets(
    collateral: bigint,
    options: MaxCapacitiesOptions["borrow"] = {},
  ) {
    return MarketUtils.getMaxBorrowAssets(collateral, this, {
      lltv: options.maxLtv ?? this.config.lltv,
    });
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position.
   * @param position The borrow position to consider.
   */
  public getMaxBorrowableAssets(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getMaxBorrowableAssets(position, this, this.config);
  }

  /**
   * Returns the amount of collateral that would be seized in a liquidation given a certain amount of repaid shares.
   * @param repaidShares The amount of shares hypothetically repaid.
   */
  public getLiquidationSeizedAssets(repaidShares: bigint) {
    return MarketUtils.getLiquidationSeizedAssets(
      repaidShares,
      this,
      this.config,
    );
  }

  /**
   * Returns the amount of borrow shares that would be repaid in a liquidation given a certain amount of seized collateral.
   * @param seizedAssets The amount of collateral hypothetically seized.
   */
  public getLiquidationRepaidShares(seizedAssets: bigint) {
    return MarketUtils.getLiquidationRepaidShares(
      seizedAssets,
      this,
      this.config,
    );
  }

  /**
   * Returns the maximum amount of collateral that is worth being seized in a liquidation given a certain borrow position.
   * @param position The borrow position to consider.
   */
  public getSeizableCollateral(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getSeizableCollateral(position, this, this.config);
  }

  /**
   * Returns the amount of collateral that can be withdrawn given a certain borrow position.
   * @param position The borrow position to consider.
   */
  public getWithdrawableCollateral(
    position: {
      collateral: bigint;
      borrowShares: bigint;
    },
    options: MaxCapacitiesOptions["withdrawCollateral"] = {},
  ) {
    return MarketUtils.getWithdrawableCollateral(position, this, {
      lltv: options.maxLtv ?? this.config.lltv,
    });
  }

  /**
   * Returns whether a given borrow position is healthy.
   * @param position The borrow position to check.
   */
  public isHealthy(position: { collateral: bigint; borrowShares: bigint }) {
    return MarketUtils.isHealthy(position, this, this.config);
  }

  /**
   * Returns the liquidation price of a given borrow position.
   * @param position The borrow position to consider.
   */
  public getLiquidationPrice(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getLiquidationPrice(position, this, this.config);
  }

  /**
   * Returns the price deviation required for the given borrow position to be unhealthy (scaled by WAD).
   * @param position The borrow position to consider.
   */
  public getPriceVariationToLiquidation(position: {
    collateral: bigint;
    borrowShares: bigint;
  }) {
    return MarketUtils.getPriceVariationToLiquidation(
      position,
      this,
      this.config,
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
    return MarketUtils.getHealthFactor(position, this, this.config);
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
    return MarketUtils.getBorrowCapacityUsage(position, this, this.config);
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position
   * and the reason for the limit.
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
    options: MaxCapacitiesOptions["borrow"] = {},
  ): CapacityLimit {
    // handle edge cases when the user is liquidatable (maxBorrow < borrow)
    const maxBorrowableAssets = MathLib.zeroFloorSub(
      this.getMaxBorrowAssets(collateral, options),
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
   * @param position The borrow position to consider.
   */
  public getWithdrawCollateralCapacityLimit(
    position: {
      collateral: bigint;
      borrowShares: bigint;
    },
    options: MaxCapacitiesOptions["withdrawCollateral"] = {},
  ): CapacityLimit {
    const withdrawableCollateral = this.getWithdrawableCollateral(
      position,
      options,
    );

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
    options: MaxCapacitiesOptions = {},
  ): MaxPositionCapacities {
    return {
      supply: {
        value: loanTokenBalance,
        limiter: CapacityLimitReason.balance,
      },
      withdraw: this.getWithdrawCapacityLimit(position),
      borrow: this.getBorrowCapacityLimit(position, options.borrow),
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
        options.withdrawCollateral,
      ),
    };
  }
}

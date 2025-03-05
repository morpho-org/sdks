import { BlueErrors } from "../errors.js";
import {
  CapacityLimitReason,
  Market,
  type MaxBorrowOptions,
  type MaxPositionCapacities,
  type MaxWithdrawCollateralOptions,
} from "../market/index.js";
import { MathLib } from "../math/MathLib.js";
import type { Address, BigIntish, MarketId } from "../types.js";

export interface IPosition {
  user: Address;
  marketId: MarketId;
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

export class Position implements IPosition {
  /**
   * The user holding this position.
   */
  public readonly user: Address;

  /**
   * The id of the market on which this position is held.
   */
  public readonly marketId: MarketId;

  /**
   * The amount of supply shares held with this position.
   */
  public supplyShares: bigint;
  /**
   * The amount of borrow shares held with this position.
   */
  public borrowShares: bigint;
  /**
   * The amount of collateral assets held with this position.
   */
  public collateral: bigint;

  constructor({
    user,
    marketId,
    supplyShares,
    borrowShares,
    collateral,
  }: IPosition) {
    this.user = user;
    this.marketId = marketId;
    this.supplyShares = supplyShares;
    this.borrowShares = borrowShares;
    this.collateral = collateral;
  }
}

export interface IAccrualPosition extends Omit<IPosition, "marketId"> {}

export class AccrualPosition extends Position implements IAccrualPosition {
  /**
   * The market on which this position is held.
   */
  public readonly market: Market;

  constructor(position: IAccrualPosition, market: Market) {
    super({ ...position, marketId: market.id });

    this.market = market;
  }

  get supplyAssets() {
    return this.market.toSupplyAssets(this.supplyShares);
  }

  get borrowAssets() {
    return this.market.toBorrowAssets(this.borrowShares);
  }

  /**
   * The value of this position's collateral quoted in loan assets.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get collateralValue() {
    return this.market.getCollateralValue(this.collateral);
  }

  /**
   * The maximum amount of loan assets that can be borrowed against this position's collateral.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get maxBorrowAssets() {
    return this.market.getMaxBorrowAssets(this.collateral);
  }

  /**
   * The maximum additional amount of assets that can be borrowed against this position's collateral.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get maxBorrowableAssets() {
    const { maxBorrowAssets } = this;
    if (maxBorrowAssets == null) return;

    return MathLib.zeroFloorSub(maxBorrowAssets, this.borrowAssets);
  }

  /**
   * The maximum amount of collateral that can be seized in exchange for the outstanding debt.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get seizableCollateral() {
    return this.market.getSeizableCollateral(this);
  }

  /**
   * The maximum amount of collateral that can be withdrawn.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get withdrawableCollateral() {
    return this.market.getWithdrawableCollateral(this);
  }

  /**
   * Whether this position is healthy.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get isHealthy() {
    return this.market.isHealthy(this);
  }

  /**
   * The price of the collateral quoted in loan assets that would allow this position to be liquidated.
   */
  get liquidationPrice() {
    return this.market.getLiquidationPrice(this);
  }

  /**
   * The price variation required for the position to reach its liquidation threshold (scaled by WAD).
   * Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
   * `undefined` iff the market's oracle is undefined or reverts.
   * Null if the position is not a borrow.
   */
  get priceVariationToLiquidationPrice() {
    return this.market.getPriceVariationToLiquidationPrice(this);
  }

  /**
   * This position's Loan-To-Value (debt over collateral power, scaled by WAD).
   * If the collateral price is 0, LTV is `MaxUint256`.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get ltv() {
    return this.market.getLtv(this);
  }

  /**
   * This position's health factor (collateral power over debt, scaled by WAD).
   * If the debt is 0, health factor is `MaxUint256`.
   * `undefined` iff the market's oracle is undefined or reverts.
   */
  get healthFactor() {
    return this.market.getHealthFactor(this);
  }

  /**
   * The percentage of this position's borrow power currently used (scaled by WAD).
   * If the collateral price is 0, usage is `MaxUint256`.
   */
  get borrowCapacityUsage() {
    return this.market.getBorrowCapacityUsage(this);
  }

  /**
   * Returns the maximum amount of loan assets that can be withdrawn given a certain supply position
   * and a balance of loan assets, and the reason for the limit.
   */
  get withdrawCapacityLimit() {
    return this.market.getWithdrawCapacityLimit(this);
  }

  /**
   * Returns a new position derived from this position, whose interest has been accrued up to the given timestamp.
   * @param timestamp The timestamp at which to accrue interest. Must be greater than or equal to the market's `lastUpdate`.
   */
  public accrueInterest(timestamp?: BigIntish) {
    return new AccrualPosition(this, this.market.accrueInterest(timestamp));
  }

  public supply(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    let { market } = this;
    ({ market, assets, shares } = market.supply(assets, shares, timestamp));

    const position = new AccrualPosition(this, market);

    position.supplyShares += shares;

    return { position, assets, shares };
  }

  public withdraw(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    let { market } = this;
    ({ market, assets, shares } = market.withdraw(assets, shares, timestamp));

    const position = new AccrualPosition(this, market);

    position.supplyShares -= shares;

    if (position.supplyShares < 0n)
      throw new BlueErrors.InsufficientPosition(
        position.user,
        position.marketId,
      );

    return { position, assets, shares };
  }

  public supplyCollateral(assets: bigint) {
    this.collateral += assets;

    return new AccrualPosition(this, new Market(this.market));
  }

  public withdrawCollateral(assets: bigint, timestamp?: BigIntish) {
    if (this.market.price == null)
      throw new BlueErrors.UnknownOraclePrice(this.marketId);

    const position = this.accrueInterest(timestamp);

    position.collateral -= assets;

    if (position.collateral < 0n)
      throw new BlueErrors.InsufficientPosition(
        position.user,
        position.marketId,
      );

    if (!position.isHealthy!)
      throw new BlueErrors.InsufficientCollateral(
        position.user,
        position.marketId,
      );

    return position;
  }

  public borrow(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    let { market } = this;
    if (market.price == null)
      throw new BlueErrors.UnknownOraclePrice(market.id);

    ({ market, assets, shares } = market.borrow(assets, shares, timestamp));

    const position = new AccrualPosition(this, market);

    position.borrowShares += shares;

    if (!position.isHealthy!)
      throw new BlueErrors.InsufficientCollateral(this.user, this.marketId);

    return { position, assets, shares };
  }

  public repay(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    let { market } = this;
    ({ market, assets, shares } = market.repay(assets, shares, timestamp));

    const position = new AccrualPosition(this, market);

    position.borrowShares -= shares;

    if (position.borrowShares < 0n)
      throw new BlueErrors.InsufficientPosition(
        position.user,
        position.marketId,
      );

    return { position, assets, shares };
  }

  public getBorrowCapacityLimit(options?: MaxBorrowOptions) {
    return this.market.getBorrowCapacityLimit(this, options);
  }

  public getWithdrawCollateralCapacityLimit(
    options?: MaxWithdrawCollateralOptions,
  ) {
    return this.market.getWithdrawCollateralCapacityLimit(this, options);
  }

  public getRepayCapacityLimit(loanTokenBalance: bigint) {
    return this.market.getRepayCapacityLimit(
      this.borrowShares,
      loanTokenBalance,
    );
  }

  public getMaxCapacities(
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
      withdraw: this.withdrawCapacityLimit,
      borrow: this.getBorrowCapacityLimit(options?.borrow),
      repay: this.getRepayCapacityLimit(loanTokenBalance),
      supplyCollateral: {
        value: collateralTokenBalance,
        limiter: CapacityLimitReason.balance,
      },
      withdrawCollateral: this.getWithdrawCollateralCapacityLimit(
        options?.withdrawCollateral,
      ),
    };
  }
}

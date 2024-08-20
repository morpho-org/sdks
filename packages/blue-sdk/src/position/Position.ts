import { BlueErrors } from "../errors";
import { Market } from "../market";
import { Address, MarketId } from "../types";

export interface InputPosition {
  user: Address;
  marketId: MarketId;
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

export class Position implements InputPosition {
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
  }: InputPosition) {
    this.user = user;
    this.marketId = marketId;
    this.supplyShares = supplyShares;
    this.borrowShares = borrowShares;
    this.collateral = collateral;
  }
}

export interface InputAccrualPosition extends Omit<InputPosition, "marketId"> {}

export class AccrualPosition extends Position implements InputAccrualPosition {
  /**
   * The market on which this position is held.
   */
  public readonly market: Market;

  constructor(position: InputAccrualPosition, market: Market) {
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
   */
  get collateralValue() {
    return this.market.getCollateralValue(this.collateral);
  }

  /**
   * The maximum amount of loan assets that can be borrowed against this position's collateral.
   */
  get maxBorrowAssets() {
    return this.market.getMaxBorrowAssets(this.collateral);
  }

  /**
   * The maximum additional amount of assets that can be borrowed against this position's collateral.
   */
  get maxBorrowableAssets() {
    return this.market.getMaxBorrowableAssets(this);
  }

  /**
   * The maximum amount of collateral that can be seized in exchange for the outstanding debt.
   */
  get seizableCollateral() {
    return this.market.getSeizableCollateral(this);
  }

  /**
   * The maximum amount of collateral that can be withdrawn.
   */
  get withdrawableCollateral() {
    return this.market.getWithdrawableCollateral(this);
  }

  /**
   * Whether this position is healthy.
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
   * The variation of the price of the collateral quoted in loan assets that would allow this position to be liquidated,
   * relative to the current collateral price (scaled by WAD).
   */
  get priceVariationToLiquidation() {
    return this.market.getPriceVariationToLiquidation(this);
  }

  /**
   * This position's Loan-To-Value (debt over collateral power, scaled by WAD).
   * If the collateral price is 0, LTV is `MaxUint256`.
   */
  get ltv() {
    return this.market.getLtv(this);
  }

  /**
   * This position's health factor (collateral power over debt, scaled by WAD).
   * If the debt is 0, health factor is `MaxUint256`.
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

  get borrowCapacityLimit() {
    return this.market.getBorrowCapacityLimit(this);
  }

  get withdrawCapacityLimit() {
    return this.market.getWithdrawCapacityLimit(this);
  }

  get withdrawCollateralCapacityLimit() {
    return this.market.getWithdrawCollateralCapacityLimit(this);
  }

  public accrueInterest(timestamp: bigint) {
    return new AccrualPosition(this, this.market.accrueInterest(timestamp));
  }

  public supply(assets: bigint, shares: bigint, timestamp?: bigint) {
    let { market } = this;
    ({ market, assets, shares } = market.supply(assets, shares, timestamp));

    this.supplyShares += shares;

    return {
      position: new AccrualPosition(this, market),
      assets,
      shares,
    };
  }

  public withdraw(assets: bigint, shares: bigint, timestamp?: bigint) {
    let { market } = this;
    ({ market, assets, shares } = market.withdraw(assets, shares, timestamp));

    this.supplyShares -= shares;

    if (this.supplyShares < 0n)
      throw new BlueErrors.InsufficientPosition(this.user, this.marketId);

    return {
      position: new AccrualPosition(this, market),
      assets,
      shares,
    };
  }

  public supplyCollateral(
    assets: bigint,
    timestamp: bigint = this.market.lastUpdate,
  ) {
    const market = this.market.accrueInterest(timestamp);

    this.collateral += assets;

    return new AccrualPosition(this, market);
  }

  public withdrawCollateral(
    assets: bigint,
    timestamp: bigint = this.market.lastUpdate,
  ) {
    const market = this.market.accrueInterest(timestamp);

    this.collateral -= assets;

    if (this.collateral < 0n)
      throw new BlueErrors.InsufficientPosition(this.user, this.marketId);

    if (!market.isHealthy(this))
      throw new BlueErrors.InsufficientCollateral(this.user, this.marketId);

    return new AccrualPosition(this, market);
  }

  public borrow(assets: bigint, shares: bigint, timestamp?: bigint) {
    let { market } = this;
    ({ market, assets, shares } = market.borrow(assets, shares, timestamp));

    this.borrowShares += shares;

    if (!market.isHealthy(this))
      throw new BlueErrors.InsufficientCollateral(this.user, this.marketId);

    return {
      position: new AccrualPosition(this, market),
      assets,
      shares,
    };
  }

  public repay(assets: bigint, shares: bigint, timestamp?: bigint) {
    let { market } = this;
    ({ market, assets, shares } = market.repay(assets, shares, timestamp));

    this.borrowShares -= shares;

    if (this.borrowShares < 0n)
      throw new BlueErrors.InsufficientPosition(this.user, this.marketId);

    return {
      position: new AccrualPosition(this, market),
      assets,
      shares,
    };
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
  ) {
    return this.market.getMaxCapacities(
      this,
      loanTokenBalance,
      collateralTokenBalance,
    );
  }
}

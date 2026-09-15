import { Time, ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { BlueErrors, UnsupportedMarketIrmError } from "../errors.js";
import {
  AdaptiveCurveIrmLib,
  MathLib,
  type RoundingDirection,
} from "../math/index.js";
import type { BigIntish } from "../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../utils.js";
import { type IMarketParams, MarketParams } from "./MarketParams.js";
import { MarketUtils } from "./MarketUtils.js";

/** Options for max borrow capacity calculations. */
export interface MaxBorrowOptions {
  maxLtv?: bigint;
}
/** Options for max withdraw collateral capacity calculations. */
export interface MaxWithdrawCollateralOptions {
  maxLtv?: bigint;
}

/** Capacity limits for each market operation available to a position. */
export interface MaxPositionCapacities {
  supply: CapacityLimit;
  withdraw: CapacityLimit;
  borrow: CapacityLimit | undefined;
  repay: CapacityLimit;
  supplyCollateral: CapacityLimit;
  withdrawCollateral: CapacityLimit | undefined;
}

/** Plain input shape for a Morpho Blue market. */
export interface IMarket {
  params: IMarketParams;
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
    this.params =
      params instanceof MarketParams ? params : new MarketParams(params);
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
   * The market's Annual Percentage Yield (APY) at the IRM's target utilization rate, if applicable.
   */
  get apyAtTarget() {
    if (this.rateAtTarget == null) return;

    return MarketUtils.rateToApy(this.rateAtTarget);
  }

  /**
   * Returns the instantaneous rate at which interest accrues for borrowers of this market,
   * if `accrueInterest` was called immediately onchain (scaled by WAD).
   *
   * Even if `accrueInterest` is called immediately onchain,
   * the instantaneous rate only corresponds to an intermediary value used to calculate
   * the actual average rate experienced by borrowers of this market.
   *
   * If interested in the instantaneous rate experienced by existing market actors at a specific timestamp,
   * use `getEndBorrowRate(timestamp)`, `getBorrowApy(timestamp)`, or `getSupplyApy(timestamp)` instead.
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  get endBorrowRate() {
    return this.getAccrualBorrowRates().endBorrowRate;
  }

  /**
   * Returns the average rate at which interest _would_ accrue from `lastUpdate`
   * till now, if `accrueInterest` was called immediately onchain (scaled by WAD).
   * If `accrueInterest` was just called, the average rate equals the instantaneous rate,
   * so it is equivalent to `getBorrowRate(lastUpdate)`.
   *
   * In most cases, `accrueInterest` will not be called immediately onchain,
   * so the average rate is only an intermediary value.
   *
   * If interested in the average rate experienced by existing market actors at a specific timestamp,
   * use `getAvgBorrowRate(timestamp)`, `getAvgBorrowApy(timestamp)`, or `getAvgSupplyApy(timestamp)` instead.
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  get avgBorrowRate() {
    return this.getAccrualBorrowRates().avgBorrowRate;
  }

  /**
   * The market's current, instantaneous supply-side Annual Percentage Yield (APY).
   * If interested in the APY at a specific timestamp, use `getSupplyApy(timestamp)` instead.
   * @throws {UnsupportedMarketIrmError} when positive debt uses a nonzero unsupported IRM.
   */
  get supplyApy() {
    return this.getSupplyApy();
  }

  /**
   * The market's current, instantaneous borrow-side Annual Percentage Yield (APY).
   * If interested in the APY at a specific timestamp, use `getBorrowApy(timestamp)` instead.
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  get borrowApy() {
    return this.getBorrowApy();
  }

  /**
   * Returns the instantaneous rate at which interest accrues for borrowers of this market,
   * at the given timestamp, if the state remains unchanged (not accrued) (scaled by WAD).
   * It is fundamentally different from the rate at which interest is paid by borrowers to lenders in the case of an interest accrual,
   * as in the case of the AdaptiveCurveIRM, the (approximated) average rate since the last update is used instead.
   * @param timestamp The timestamp at which to calculate the borrow rate.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current borrow rate).
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  public getEndBorrowRate(timestamp: BigIntish = Time.timestamp()) {
    return this.getAccrualBorrowRates(timestamp).endBorrowRate;
  }

  /**
   * Returns the average rate at which interest _would_ accrue for borrowers of this market,
   * if `accrueInterest` was called at the given timestamp (scaled by WAD).
   * @param timestamp The timestamp at which to calculate the average borrow rate.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current average borrow rate).
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  public getAvgBorrowRate(timestamp: BigIntish = Time.timestamp()) {
    return this.getAccrualBorrowRates(timestamp).avgBorrowRate;
  }

  /**
   * Returns the rates that _would_ apply to interest accrual for borrowers of this market,
   * if `accrueInterest` was called at the given timestamp (scaled by WAD).
   * @param timestamp The timestamp at which to calculate the accrual borrow rate.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current accrual borrow rate).
   */
  protected getAccrualBorrowRates(timestamp: BigIntish = Time.timestamp()): {
    elapsed: bigint;
    avgBorrowRate: bigint;
    endBorrowRate: bigint;
    endRateAtTarget?: bigint;
  } {
    const elapsed = MathLib.zeroFloorSub(timestamp, this.lastUpdate);

    if (this.rateAtTarget == null) {
      if (this.params.irm !== ZERO_ADDRESS) {
        throw new UnsupportedMarketIrmError(this.id, this.params.irm);
      }
      return {
        elapsed,
        avgBorrowRate: 0n,
        endBorrowRate: 0n,
      };
    }

    return {
      elapsed,
      ...AdaptiveCurveIrmLib.getBorrowRate(
        this.utilization,
        this.rateAtTarget,
        elapsed,
      ),
    };
  }

  /**
   * The market's instantaneous borrow-side Annual Percentage Yield (APY) at the given timestamp,
   * if the state remains unchanged (not accrued).
   * @param timestamp The timestamp at which to calculate the borrow APY.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current borrow APY).
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  public getBorrowApy(timestamp: BigIntish = Time.timestamp()) {
    const borrowRate = this.getEndBorrowRate(timestamp);

    return MarketUtils.rateToApy(borrowRate);
  }

  /**
   * The market's instantaneous supply-side Annual Percentage Yield (APY) at the given timestamp,
   * if the state remains unchanged (not accrued).
   * @param timestamp The timestamp at which to calculate the supply APY.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current supply APY).
   * @throws {UnsupportedMarketIrmError} when positive debt uses a nonzero unsupported IRM.
   */
  public getSupplyApy(timestamp: BigIntish = Time.timestamp()) {
    if (this.totalBorrowAssets === 0n) return 0;
    const borrowRate = this.getEndBorrowRate(timestamp);

    return MarketUtils.rateToApy(
      MathLib.wMulUp(
        MathLib.wMulDown(borrowRate, this.utilization),
        MathLib.WAD - this.fee,
      ),
    );
  }

  /**
   * The market's experienced borrow-side Annual Percentage Yield (APY),
   * if interest was to be accrued at the given timestamp.
   * @param timestamp The timestamp at which to calculate the borrow APY.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current borrow APY).
   * @throws {UnsupportedMarketIrmError} when the market uses a nonzero unsupported IRM.
   */
  public getAvgBorrowApy(timestamp: BigIntish = Time.timestamp()) {
    const borrowRate = this.getAvgBorrowRate(timestamp);

    return MarketUtils.rateToApy(borrowRate);
  }

  /**
   * Returns the average rate at which interest _would_ accrue for suppliers of this market,
   * if `accrueInterest` was called at the given timestamp (scaled by WAD).
   * @param timestamp The timestamp at which to calculate the average supply rate.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current average supply rate).
   * @throws {UnsupportedMarketIrmError} when positive debt uses a nonzero unsupported IRM.
   */
  public getAvgSupplyRate(timestamp: BigIntish = Time.timestamp()) {
    if (this.totalBorrowAssets === 0n) return 0n;
    const borrowRate = this.getAvgBorrowRate(timestamp);

    return MathLib.wMulUp(
      MathLib.wMulDown(borrowRate, this.utilization),
      MathLib.WAD - this.fee,
    );
  }

  /**
   * The market's experienced supply-side Annual Percentage Yield (APY),
   * if interest was to be accrued at the given timestamp.
   * @param timestamp The timestamp at which to calculate the supply APY.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `Time.timestamp()` (returns the current supply APY).
   * @throws {UnsupportedMarketIrmError} when positive debt uses a nonzero unsupported IRM.
   */
  public getAvgSupplyApy(timestamp: BigIntish = Time.timestamp()) {
    return MarketUtils.rateToApy(this.getAvgSupplyRate(timestamp));
  }

  /**
   * Returns a new market derived from this market, whose interest has been accrued up to the given timestamp.
   * @param timestamp The timestamp at which to accrue interest.
   * Earlier timestamps are treated as `lastUpdate`.
   * Defaults to `lastUpdate`. At or before `lastUpdate`, returns an unchanged copy without projecting interest or rewinding the timestamp.
   * @returns A new `Market`, unchanged for past or equal timestamps; otherwise with accrued asset totals and fee shares, updated `lastUpdate`, and projected `rateAtTarget`.
   * @throws {UnsupportedMarketIrmError} when projection requires a nonzero unsupported IRM.
   * @example
   * ```ts
   * import { ChainId, getChainAddress, Market, MarketParams } from "@morpho-org/blue-sdk";
   *
   * const market = new Market({
   *   params: MarketParams.idle(getChainAddress(ChainId.EthMainnet, "usdc")),
   *   totalSupplyAssets: 1_000_000n,
   *   totalBorrowAssets: 0n,
   *   totalSupplyShares: 1_000_000_000_000n,
   *   totalBorrowShares: 0n,
   *   lastUpdate: 1_700_000_000n,
   *   fee: 0n,
   * });
   * const accrued = market.accrueInterest(1_699_999_999n);
   * // accrued satisfies Market
   * // accrued.lastUpdate === 1_700_000_000n; accrued.totalSupplyAssets === 1_000_000n
   * // market.lastUpdate === 1_700_000_000n
   * ```
   */
  public accrueInterest(timestamp: BigIntish = this.lastUpdate) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    timestamp = BigInt(timestamp);

    if (timestamp <= this.lastUpdate) return new Market(this);
    if (
      this.rateAtTarget == null &&
      this.params.irm !== ZERO_ADDRESS &&
      this.totalBorrowAssets === 0n
    )
      return new Market({ ...this, lastUpdate: timestamp });

    const { elapsed, avgBorrowRate, endRateAtTarget } =
      this.getAccrualBorrowRates(timestamp);

    const { interest, feeShares } = MarketUtils.getAccruedInterest(
      avgBorrowRate,
      this,
      elapsed,
    );

    return new Market({
      ...this,
      totalSupplyAssets: this.totalSupplyAssets + interest,
      totalBorrowAssets: this.totalBorrowAssets + interest,
      totalSupplyShares: this.totalSupplyShares + feeShares,
      lastUpdate: timestamp,
      rateAtTarget: endRateAtTarget,
    });
  }

  /**
   * Applies a supply to an interest-accrued copy of this market.
   * @param assets Loan assets to supply, or zero when `shares` is provided.
   * @param shares Supply shares to mint, or zero when `assets` is provided.
   * @param timestamp Optional accrual timestamp. Defaults to `lastUpdate`; earlier timestamps skip interest accrual while still applying the operation.
   * @returns The updated market and normalized asset and share amounts.
   * @throws {BlueErrors.InconsistentInput} when both or neither of `assets` and `shares` are nonzero.
   * @throws {UnsupportedMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @example
   * ```ts
   * import { ChainId, getChainAddress, Market, MarketParams } from "@morpho-org/blue-sdk";
   *
   * const market = new Market({
   *   params: MarketParams.idle(getChainAddress(ChainId.EthMainnet, "usdc")),
   *   totalSupplyAssets: 0n,
   *   totalBorrowAssets: 0n,
   *   totalSupplyShares: 0n,
   *   totalBorrowShares: 0n,
   *   lastUpdate: 1_700_000_000n,
   *   fee: 0n,
   * });
   * const result = market.supply(1_000_000n, 0n);
   * // result satisfies { market: Market; assets: bigint; shares: bigint }
   * // result.assets === 1_000_000n; result.shares === 1_000_000_000_000n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public supply(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if ((assets === 0n) === (shares === 0n))
      throw new BlueErrors.InconsistentInput(assets, shares);

    const market = this.accrueInterest(timestamp);

    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    if (shares === 0n) shares = market.toSupplyShares(assets, "Down");
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    else assets = market.toSupplyAssets(shares, "Up");

    market.totalSupplyAssets += assets;
    market.totalSupplyShares += shares;

    return { market, assets, shares };
  }

  /**
   * Applies a withdrawal to an interest-accrued copy of this market.
   * @param assets Loan assets to withdraw, or zero when `shares` is provided.
   * @param shares Supply shares to burn, or zero when `assets` is provided.
   * @param timestamp Optional accrual timestamp. Defaults to `lastUpdate`; earlier timestamps skip interest accrual while still applying the operation.
   * @returns The updated market and normalized asset and share amounts.
   * @throws {BlueErrors.InconsistentInput} when both or neither of `assets` and `shares` are nonzero.
   * @throws {UnsupportedMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @throws {BlueErrors.InsufficientLiquidity} when the withdrawal exceeds the accrued market's liquidity.
   * @example
   * ```ts
   * import { ChainId, getChainAddress, Market, MarketParams } from "@morpho-org/blue-sdk";
   *
   * const market = new Market({
   *   params: MarketParams.idle(getChainAddress(ChainId.EthMainnet, "usdc")),
   *   totalSupplyAssets: 1_000_000n,
   *   totalBorrowAssets: 0n,
   *   totalSupplyShares: 1_000_000_000_000n,
   *   totalBorrowShares: 0n,
   *   lastUpdate: 1_700_000_000n,
   *   fee: 0n,
   * });
   * const result = market.withdraw(500_000n, 0n);
   * // result satisfies { market: Market; assets: bigint; shares: bigint }
   * // result.assets === 500_000n; result.shares === 500_000_000_000n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public withdraw(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if ((assets === 0n) === (shares === 0n))
      throw new BlueErrors.InconsistentInput(assets, shares);

    const market = this.accrueInterest(timestamp);

    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    if (shares === 0n) shares = market.toSupplyShares(assets, "Up");
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    else assets = market.toSupplyAssets(shares, "Down");

    market.totalSupplyAssets -= assets;
    market.totalSupplyShares -= shares;

    if (market.totalBorrowAssets > market.totalSupplyAssets)
      throw new BlueErrors.InsufficientLiquidity(market.id);

    return { market, assets, shares };
  }

  /**
   * Applies a borrow to an interest-accrued copy of this market.
   * @param assets Loan assets to borrow, or zero when `shares` is provided.
   * @param shares Borrow shares to mint, or zero when `assets` is provided.
   * @param timestamp Optional accrual timestamp. Defaults to `lastUpdate`; earlier timestamps skip interest accrual while still applying the operation.
   * @returns The updated market and normalized asset and share amounts.
   * @throws {BlueErrors.InconsistentInput} when both or neither of `assets` and `shares` are nonzero.
   * @throws {UnsupportedMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @throws {BlueErrors.InsufficientLiquidity} when the borrow exceeds the accrued market's liquidity.
   * @example
   * ```ts
   * import { ChainId, Market } from "@morpho-org/blue-sdk";
   * import { markets } from "@morpho-org/morpho-test";
   *
   * const market = new Market({
   *   params: markets[ChainId.EthMainnet].eth_wstEth,
   *   totalSupplyAssets: 10n ** 18n,
   *   totalBorrowAssets: 0n,
   *   totalSupplyShares: 10n ** 24n,
   *   totalBorrowShares: 0n,
   *   lastUpdate: 1_700_000_000n,
   *   fee: 0n,
   * });
   * const result = market.borrow(10n ** 17n, 0n);
   * // result satisfies { market: Market; assets: bigint; shares: bigint }
   * // result.assets === 10n ** 17n; result.shares === 10n ** 23n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public borrow(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if ((assets === 0n) === (shares === 0n))
      throw new BlueErrors.InconsistentInput(assets, shares);

    const market = this.accrueInterest(timestamp);

    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    if (shares === 0n) shares = market.toBorrowShares(assets, "Up");
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    else assets = market.toBorrowAssets(shares, "Down");

    market.totalBorrowAssets += assets;
    market.totalBorrowShares += shares;

    if (market.totalBorrowAssets > market.totalSupplyAssets)
      throw new BlueErrors.InsufficientLiquidity(market.id);

    return { market, assets, shares };
  }

  /**
   * Simulates a repayment on this market and returns the resulting market state.
   * Exactly one of `assets` or `shares` must be non-zero.
   * When repaying by shares, the repaid `assets` are rounded up and may exceed
   * `totalBorrowAssets`; the market total is then floored at zero, mirroring `Morpho.repay`.
   * @param assets The amount of loan assets to repay (`0n` when repaying by shares).
   * @param shares The amount of borrow shares to repay (`0n` when repaying by assets).
   * @param timestamp The timestamp at which to accrue interest before repaying. Defaults to `lastUpdate`; earlier timestamps skip interest accrual while still repaying.
   * @returns The accrued market after repayment, along with the resolved `assets` and `shares` repaid.
   * @throws {BlueErrors.InconsistentInput} If both or neither of `assets` and `shares` are non-zero.
   * @throws {UnsupportedMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @example
   * ```ts
   * const { market: after, assets } = market.repay(0n, position.borrowShares);
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  public repay(assets: bigint, shares: bigint, timestamp?: BigIntish) {
    if ((assets === 0n) === (shares === 0n))
      throw new BlueErrors.InconsistentInput(assets, shares);

    const market = this.accrueInterest(timestamp);

    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    if (shares === 0n) shares = market.toBorrowShares(assets, "Down");
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    else assets = market.toBorrowAssets(shares, "Up");

    market.totalBorrowAssets = MathLib.zeroFloorSub(
      market.totalBorrowAssets,
      assets,
    );
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
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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

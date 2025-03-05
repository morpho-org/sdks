import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  LIQUIDATION_CURSOR,
  MAX_LIQUIDATION_INCENTIVE_FACTOR,
  ORACLE_PRICE_SCALE,
  SECONDS_PER_YEAR,
} from "../constants.js";
import { MathLib, type RoundingDirection, SharesMath } from "../math/index.js";
import type { BigIntish, MarketId } from "../types.js";
import type { IMarketParams } from "./MarketParams.js";

/**
 * Namespace of utility functions to ease market-related calculations.
 */
export namespace MarketUtils {
  /**
   * Returns the id of a market based on its params.
   * @param market The market params.
   */
  export function getMarketId(market: IMarketParams) {
    return `0x${bytesToHex(
      keccak_256(
        hexToBytes(
          `${
            market.loanToken.substring(2).toLowerCase().padStart(64, "0") +
            market.collateralToken
              .substring(2)
              .toLowerCase()
              .padStart(64, "0") +
            market.oracle.substring(2).padStart(64, "0") +
            market.irm.substring(2).toLowerCase().padStart(64, "0") +
            BigInt(market.lltv).toString(16).padStart(64, "0")
          }`,
        ),
      ),
    )}` as MarketId;
  }

  /**
   * Returns the liquidation incentive factor for a given market params.
   * @param config The market params.
   */
  export function getLiquidationIncentiveFactor({ lltv }: { lltv: BigIntish }) {
    return MathLib.min(
      MAX_LIQUIDATION_INCENTIVE_FACTOR,
      MathLib.wDivDown(
        MathLib.WAD,
        MathLib.WAD -
          MathLib.wMulDown(LIQUIDATION_CURSOR, MathLib.WAD - BigInt(lltv)),
      ),
    );
  }

  /**
   * Returns the market's utilization rate (scaled by WAD).
   * @param market The market state.
   */
  export function getUtilization({
    totalSupplyAssets,
    totalBorrowAssets,
  }: {
    totalSupplyAssets: BigIntish;
    totalBorrowAssets: BigIntish;
  }) {
    totalSupplyAssets = BigInt(totalSupplyAssets);
    totalBorrowAssets = BigInt(totalBorrowAssets);

    if (totalSupplyAssets === 0n) {
      if (totalBorrowAssets > 0n) return MathLib.MAX_UINT_256;

      return 0n;
    }

    return MathLib.wDivDown(totalBorrowAssets, totalSupplyAssets);
  }

  /**
   * Returns the rate at which interest accrued for suppliers on the corresponding market,
   * since the last time the market was updated (scaled by WAD).
   * @param borrowRate The average borrow rate since the last market update (scaled by WAD).
   * @param market The market state.
   */
  export function getSupplyRate(
    borrowRate: BigIntish,
    { utilization, fee }: { utilization: BigIntish; fee: BigIntish },
  ) {
    const borrowRateWithoutFees = MathLib.wMulUp(borrowRate, utilization);

    return MathLib.wMulUp(borrowRateWithoutFees, MathLib.WAD - BigInt(fee));
  }

  /**
   * Returns the per-second rate continuously compounded over the given period, as calculated in Morpho Blue (scaled by WAD).
   * If the period is 1 year, the compounded rate correspond to the Annual Percentage Yield (APY)
   * @param rate The per-second rate to compound (scaled by WAD).
   * @param period The period to compound the rate over (in seconds). Defaults to 1 year.
   */
  export function compoundRate(
    rate: BigIntish,
    period: BigIntish = SECONDS_PER_YEAR,
  ) {
    return MathLib.wTaylorCompounded(rate, period);
  }

  /**
   * Returns the interest accrued on both sides of the given market
   * as well as the supply shares minted to the fee recipient.
   * @param borrowRate The average borrow rate since the last market update (scaled by WAD).
   * @param market The market state.
   * @param elapsed The time elapsed since the last market update (in seconds).
   */
  export function getAccruedInterest(
    borrowRate: BigIntish,
    {
      totalSupplyAssets,
      totalBorrowAssets,
      totalSupplyShares,
      fee,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
      totalSupplyShares: BigIntish;
      fee: BigIntish;
    },
    elapsed = 0n,
  ) {
    const interest = MathLib.wMulDown(
      totalBorrowAssets,
      MathLib.wTaylorCompounded(borrowRate, elapsed),
    );

    const feeAmount = MathLib.wMulDown(interest, fee);
    const feeShares = toSupplyShares(
      feeAmount,
      {
        totalSupplyAssets: BigInt(totalSupplyAssets) - feeAmount,
        totalSupplyShares,
      },
      "Down",
    );

    return { interest, feeShares };
  }

  /**
   * Returns the smallest volume to supply until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  export function getSupplyToUtilization(
    market: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    utilization = BigInt(utilization);
    if (utilization === 0n) {
      if (getUtilization(market) === 0n) return 0n;

      return MathLib.MAX_UINT_256;
    }

    return MathLib.zeroFloorSub(
      MathLib.wDivUp(market.totalBorrowAssets, utilization),
      market.totalSupplyAssets,
    );
  }

  /**
   * Returns the liquidity available to withdraw until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  export function getWithdrawToUtilization(
    {
      totalSupplyAssets,
      totalBorrowAssets,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    utilization = BigInt(utilization);
    totalSupplyAssets = BigInt(totalSupplyAssets);
    totalBorrowAssets = BigInt(totalBorrowAssets);
    if (utilization === 0n) {
      if (totalBorrowAssets === 0n) return totalSupplyAssets;

      return 0n;
    }

    return MathLib.zeroFloorSub(
      totalSupplyAssets,
      MathLib.wDivUp(totalBorrowAssets, utilization),
    );
  }

  /**
   * Returns the liquidity available to borrow until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  export function getBorrowToUtilization(
    {
      totalSupplyAssets,
      totalBorrowAssets,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    return MathLib.zeroFloorSub(
      MathLib.wMulDown(totalSupplyAssets, utilization),
      totalBorrowAssets,
    );
  }

  /**
   * Returns the smallest volume to repay until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   */
  export function getRepayToUtilization(
    {
      totalSupplyAssets,
      totalBorrowAssets,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    return MathLib.zeroFloorSub(
      totalBorrowAssets,
      MathLib.wMulDown(totalSupplyAssets, utilization),
    );
  }

  export function getCollateralPower(
    collateral: BigIntish,
    { lltv }: { lltv: BigIntish },
  ) {
    return MathLib.wMulDown(collateral, lltv);
  }

  /**
   * Returns the value of a given amount of collateral quoted in loan assets.
   * Return `undefined` iff the market's price is undefined.
   */
  export function getCollateralValue(
    collateral: BigIntish,
    { price }: { price?: BigIntish },
  ) {
    if (price == null) return;

    return MathLib.mulDivDown(collateral, price, ORACLE_PRICE_SCALE);
  }

  /**
   * Returns the maximum debt allowed given a certain amount of collateral.
   * Return `undefined` iff the market's price is undefined.
   * To calculate the amount of loan assets that can be borrowed, use `getMaxBorrowableAssets`.
   */
  export function getMaxBorrowAssets(
    collateral: BigIntish,
    market: { price?: BigIntish },
    { lltv }: { lltv: BigIntish },
  ) {
    const collateralValue = getCollateralValue(collateral, market);
    if (collateralValue == null) return;

    return MathLib.wMulDown(collateralValue, lltv);
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position.
   * Return `undefined` iff the market's price is undefined.
   */
  export function getMaxBorrowableAssets(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketParams,
    );
    if (maxBorrowAssets == null) return;

    return MathLib.zeroFloorSub(
      maxBorrowAssets,
      toBorrowAssets(borrowShares, market),
    );
  }

  /**
   * Returns the amount of collateral that would be seized in a liquidation given a certain amount of repaid shares.
   * Return `undefined` iff the market's price is undefined.
   */
  export function getLiquidationSeizedAssets(
    repaidShares: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    market.price = BigInt(market.price);
    if (market.price === 0n) return 0n;

    return MathLib.mulDivDown(
      MathLib.wMulDown(
        toBorrowAssets(repaidShares, market, "Down"),
        getLiquidationIncentiveFactor(config),
      ),
      ORACLE_PRICE_SCALE,
      market.price,
    );
  }

  /**
   * Returns the amount of borrow shares that would be repaid in a liquidation given a certain amount of seized collateral.
   * Return `undefined` iff the market's price is undefined.
   */
  export function getLiquidationRepaidShares(
    seizedAssets: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    return toBorrowShares(
      MathLib.wDivUp(
        MathLib.mulDivUp(seizedAssets, market.price, ORACLE_PRICE_SCALE),
        getLiquidationIncentiveFactor(config),
      ),
      market,
      "Up",
    );
  }

  /**
   * Returns the maximum amount of collateral that is worth being seized in a liquidation given a certain borrow position.
   * Return `undefined` iff the market's price is undefined.
   */
  export function getSeizableCollateral(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    if (market.price == null) return; // Must be checked before calling `isHealthy`.

    market.price = BigInt(market.price);
    if (market.price === 0n || isHealthy(position, market, config)) return 0n;

    return MathLib.min(
      position.collateral,
      getLiquidationSeizedAssets(position.borrowShares, market, config)!,
    );
  }

  /**
   * Returns the amount of collateral that can be withdrawn given a certain borrow position.
   * Return `undefined` iff the market's price is undefined.
   */
  export function getWithdrawableCollateral(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    { lltv }: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    market.price = BigInt(market.price);
    if (market.price === 0n) return 0n;

    return MathLib.zeroFloorSub(
      collateral,
      MathLib.wDivUp(
        MathLib.mulDivUp(
          toBorrowAssets(borrowShares, market),
          ORACLE_PRICE_SCALE,
          market.price,
        ),
        lltv,
      ),
    );
  }

  /**
   * Returns whether a given borrow position is healthy.
   * Return `undefined` iff the market's price is undefined.
   * @param position The borrow position to check.
   */
  export function isHealthy(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketParams,
    );
    if (maxBorrowAssets == null) return;

    return maxBorrowAssets >= toBorrowAssets(borrowShares, market);
  }

  /**
   * Returns the price of the collateral quoted in the loan token (e.g. ETH/DAI)
   * that set the user's position to be liquidatable.
   * Returns null if the position is not a borrow.
   */
  export function getLiquidationPrice(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    borrowShares = BigInt(borrowShares);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);
    if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

    const collateralPower = getCollateralPower(collateral, marketParams);
    if (collateralPower === 0n) return MathLib.MAX_UINT_256;

    const borrowAssets = toBorrowAssets(borrowShares, market);

    return MathLib.mulDivUp(borrowAssets, ORACLE_PRICE_SCALE, collateralPower);
  }

  /**
   * Returns the price variation required for the given position to reach its liquidation threshold (scaled by WAD).
   * Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
   * Returns `undefined` iff the market's price is undefined.
   * Returns null if the position is not a borrow.
   */
  export function getPriceVariationToLiquidationPrice(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    market.price = BigInt(market.price);
    if (market.price === 0n) return null;

    const liquidationPrice = getLiquidationPrice(
      position,
      market,
      marketParams,
    );
    if (liquidationPrice == null) return null;

    return MathLib.wDivUp(liquidationPrice, market.price) - MathLib.WAD;
  }

  /**
   * Returns the health factor of a given borrow position (scaled by WAD).
   * If the debt is 0, health factor is `MaxUint256`.
   * Returns `undefined` iff the market's price is undefined.
   */
  export function getHealthFactor(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const borrowAssets = toBorrowAssets(borrowShares, market);
    if (borrowAssets === 0n) return MathLib.MAX_UINT_256;

    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketParams,
    );
    if (maxBorrowAssets == null) return;

    return MathLib.wDivDown(maxBorrowAssets, borrowAssets);
  }

  /**
   * Returns the loan-to-value ratio of a given borrow position (scaled by WAD).
   * Returns `undefined` iff the market's price is undefined.
   */
  export function getLtv(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
  ) {
    const collateralValue = getCollateralValue(collateral, market);
    if (collateralValue == null) return;
    if (collateralValue === 0n) return MathLib.MAX_UINT_256;

    return MathLib.wDivUp(
      toBorrowAssets(borrowShares, market),
      collateralValue,
    );
  }

  /**
   * Returns the usage ratio of the maximum borrow capacity given a certain borrow position (scaled by WAD).
   * Returns `undefined` iff the market's price is undefined.
   */
  export function getBorrowCapacityUsage(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const hf = getHealthFactor(position, market, marketParams);
    if (hf === undefined) return;
    if (hf === null) return 0n;
    if (hf === 0n) return MathLib.MAX_UINT_256;

    return MathLib.wDivUp(MathLib.WAD, hf);
  }

  export function toSupplyAssets(
    shares: BigIntish,
    market: {
      totalSupplyAssets: BigIntish;
      totalSupplyShares: BigIntish;
    },
    rounding: RoundingDirection = "Down",
  ) {
    return SharesMath.toAssets(
      shares,
      market.totalSupplyAssets,
      market.totalSupplyShares,
      rounding,
    );
  }

  export function toSupplyShares(
    assets: BigIntish,
    market: {
      totalSupplyAssets: BigIntish;
      totalSupplyShares: BigIntish;
    },
    rounding: RoundingDirection = "Up",
  ) {
    return SharesMath.toShares(
      assets,
      market.totalSupplyAssets,
      market.totalSupplyShares,
      rounding,
    );
  }

  export function toBorrowAssets(
    shares: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
    },
    rounding: RoundingDirection = "Up",
  ) {
    return SharesMath.toAssets(
      shares,
      market.totalBorrowAssets,
      market.totalBorrowShares,
      rounding,
    );
  }

  export function toBorrowShares(
    assets: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
    },
    rounding: RoundingDirection = "Down",
  ) {
    return SharesMath.toShares(
      assets,
      market.totalBorrowAssets,
      market.totalBorrowShares,
      rounding,
    );
  }
}

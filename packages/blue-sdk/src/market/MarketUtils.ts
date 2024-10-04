import keccak256 from "keccak256";

import {
  LIQUIDATION_CURSOR,
  MAX_LIQUIDATION_INCENTIVE_FACTOR,
  ORACLE_PRICE_SCALE,
  SECONDS_PER_YEAR,
} from "../constants.js";
import { MathLib, type RoundingDirection, SharesMath } from "../math/index.js";
import type { BigIntish, MarketId } from "../types.js";

import type { MarketParams } from "./MarketConfig.js";

/**
 * Namespace of utility functions to ease market-related calculations.
 */
export namespace MarketUtils {
  /**
   * Returns the id of a market based on its params.
   * @param market The market params.
   */
  export function getMarketId(market: MarketParams) {
    return `0x${keccak256(
      `0x${
        market.loanToken.substring(2).toLowerCase().padStart(64, "0") +
        market.collateralToken.substring(2).toLowerCase().padStart(64, "0") +
        market.oracle.substring(2).padStart(64, "0") +
        market.irm.substring(2).toLowerCase().padStart(64, "0") +
        BigInt(market.lltv).toString(16).padStart(64, "0")
      }`,
    ).toString("hex")}` as MarketId;
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
   * Returns the rate at which interest accrued on average for suppliers on the corresponding market,
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
   * Returns the Annual Percentage Yield (APY) from an average rate, as calculated in Morpho Blue.
   * @param rate The average rate to convert to APY (scaled by WAD).
   */
  export function getApy(rate: BigIntish) {
    return MathLib.wTaylorCompounded(rate, SECONDS_PER_YEAR);
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

  export function getCollateralValue(
    collateral: BigIntish,
    { price }: { price: BigIntish },
  ) {
    return MathLib.mulDivDown(collateral, price, ORACLE_PRICE_SCALE);
  }

  export function getMaxBorrowAssets(
    collateral: BigIntish,
    market: { price: BigIntish },
    { lltv }: { lltv: BigIntish },
  ) {
    return MathLib.wMulDown(getCollateralValue(collateral, market), lltv);
  }

  export function getMaxBorrowableAssets(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    marketConfig: { lltv: BigIntish },
  ) {
    return MathLib.zeroFloorSub(
      getMaxBorrowAssets(collateral, market, marketConfig),
      toBorrowAssets(borrowShares, market),
    );
  }

  export function getLiquidationSeizedAssets(
    repaidShares: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
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

  export function getLiquidationRepaidShares(
    seizedAssets: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    return toBorrowShares(
      MathLib.wDivUp(
        MathLib.mulDivUp(seizedAssets, market.price, ORACLE_PRICE_SCALE),
        getLiquidationIncentiveFactor(config),
      ),
      market,
      "Up",
    );
  }

  export function getSeizableCollateral(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    market.price = BigInt(market.price);
    if (market.price === 0n || isHealthy(position, market, config)) return 0n;

    return MathLib.min(
      position.collateral,
      getLiquidationSeizedAssets(position.borrowShares, market, config),
    );
  }

  export function getWithdrawableCollateral(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    { lltv }: { lltv: BigIntish },
  ) {
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

  export function isHealthy(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    marketConfig: { lltv: BigIntish },
  ) {
    return (
      getMaxBorrowAssets(collateral, market, marketConfig) >=
      toBorrowAssets(borrowShares, market)
    );
  }

  /**
   * Returns the price of the collateral quoted in the loan token (e.g. ETH/DAI)
   * that set the user's position to be liquidatable.
   * Returns null if the user is not a borrower
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
    marketConfig: { lltv: BigIntish },
  ) {
    borrowShares = BigInt(borrowShares);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);
    if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

    const collateralPower = getCollateralPower(collateral, marketConfig);
    if (collateralPower === 0n) return MathLib.MAX_UINT_256;

    const borrowAssets = toBorrowAssets(borrowShares, market);

    return MathLib.mulDivUp(borrowAssets, ORACLE_PRICE_SCALE, collateralPower);
  }

  /**
   * Returns the price deviation required for the given borrow position to be unhealthy (scaled by WAD).
   * @param position The borrow position to consider.
   */
  export function getPriceVariationToLiquidation(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    marketConfig: { lltv: BigIntish },
  ) {
    market.price = BigInt(market.price);
    if (market.price === 0n) return null;

    const liquidationPrice = getLiquidationPrice(
      position,
      market,
      marketConfig,
    );
    if (liquidationPrice == null) return null;

    return MathLib.WAD - MathLib.wDivUp(liquidationPrice, market.price);
  }

  export function getHealthFactor(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    marketConfig: { lltv: BigIntish },
  ) {
    borrowShares = BigInt(borrowShares);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);
    if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

    const borrowAssets = toBorrowAssets(borrowShares, market);
    if (borrowAssets === 0n) return MathLib.MAX_UINT_256;

    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketConfig,
    );

    return MathLib.wDivDown(maxBorrowAssets, borrowAssets);
  }

  export function getLtv(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
  ) {
    borrowShares = BigInt(borrowShares);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);
    if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

    const collateralValue = getCollateralValue(collateral, market);
    if (collateralValue === 0n) return MathLib.MAX_UINT_256;

    return MathLib.wDivUp(
      toBorrowAssets(borrowShares, market),
      collateralValue,
    );
  }

  export function getBorrowCapacityUsage(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price: BigIntish;
    },
    marketConfig: { lltv: BigIntish },
  ) {
    const hf = getHealthFactor(position, market, marketConfig);
    if (hf === null) return null;
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

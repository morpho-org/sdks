import { type BigIntish, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

import { MorphoAaveMath } from "./AaveV3.maths.js";

export interface PoolIndexesParams {
  /** The current pool supply index (in ray). */
  liquidityIndex: bigint;

  /** The current pool borrow index (in ray). */
  variableBorrowIndex: bigint;

  /** The current pool supply rate (in ray). */
  liquidityRate: bigint;

  /** The current pool borrow rate (in ray). */
  variableBorrowRate: bigint;

  /** The last update timestamp (in seconds). */
  lastUpdateTimestamp: BigIntish;

  /** The current timestamp (in seconds). */
  currentTimestamp: bigint;
}

export namespace PoolInterestRates {
  /**
   * Recompute the exact same logic as the Aave V3 protocol.
   * For supply index: https://github.com/aave/aave-v3-core/blob/9630ab77a8ec77b39432ce0a4ff4816384fd4cbf/contracts/protocol/libraries/logic/ReserveLogic.sol#L47
   * For borrow index: https://github.com/aave/aave-v3-core/blob/9630ab77a8ec77b39432ce0a4ff4816384fd4cbf/contracts/protocol/libraries/logic/ReserveLogic.sol#L73
   */
  export function computePoolIndexes({
    liquidityIndex,
    variableBorrowIndex,
    liquidityRate,
    variableBorrowRate,
    lastUpdateTimestamp,
    currentTimestamp,
  }: PoolIndexesParams) {
    if (BigInt(lastUpdateTimestamp) >= currentTimestamp)
      return {
        newPoolSupplyIndex: liquidityIndex,
        newPoolBorrowIndex: variableBorrowIndex,
      };

    const newPoolSupplyIndex = MorphoAaveMath.indexMul(
      liquidityIndex,
      _calculateLinearInterest(
        liquidityRate,
        BigInt(lastUpdateTimestamp),
        currentTimestamp,
      ),
    );

    const newPoolBorrowIndex = MorphoAaveMath.indexMul(
      variableBorrowIndex,
      _calculateCompoundedInterest(
        variableBorrowRate,
        BigInt(lastUpdateTimestamp),
        currentTimestamp,
      ),
    );

    return {
      newPoolSupplyIndex,
      newPoolBorrowIndex,
    };
  }

  function _calculateLinearInterest(
    rate: bigint,
    lastUpdateTimestamp: bigint,
    currentTimestamp: bigint,
  ) {
    const exp = currentTimestamp - lastUpdateTimestamp;

    if (exp === 0n) return MorphoAaveMath.INDEX_ONE;

    return MorphoAaveMath.INDEX_ONE + (rate * exp) / Time.s.from.y(1n);
  }
  function _calculateCompoundedInterest(
    rate: bigint,
    lastUpdateTimestamp: bigint,
    currentTimestamp: bigint,
  ) {
    const exp = currentTimestamp - lastUpdateTimestamp;

    if (exp === 0n) return MorphoAaveMath.INDEX_ONE;

    const expMinusOne = exp - 1n;
    const expMinusTwo = exp > 2n ? exp - 2n : 0n;

    const basePowerTwo =
      MorphoAaveMath.indexMul(rate, rate) /
      (Time.s.from.y(1n) * Time.s.from.y(1n));

    const basePowerThree =
      MorphoAaveMath.indexMul(basePowerTwo, rate) / Time.s.from.y(1n);

    const secondTerm = (exp * expMinusOne * basePowerTwo) / 2n;

    const thirdTerm = (exp * expMinusOne * expMinusTwo * basePowerThree) / 6n;

    return (
      MorphoAaveMath.INDEX_ONE +
      (rate * exp) / Time.s.from.y(1n) +
      secondTerm +
      thirdTerm
    );
  }
}

export interface MarketSizeIndexes {
  /** The pool index (in ray). */
  poolIndex: bigint;

  /** The peer-to-peer index (in ray). */
  p2pIndex: bigint;
}

export interface GrowthFactors {
  /** The pool's supply index growth factor (in ray). */
  poolSupplyGrowthFactor: bigint;

  /** Peer-to-peer supply index growth factor (in ray). */
  p2pSupplyGrowthFactor: bigint;

  /** The pool's borrow index growth factor (in ray). */
  poolBorrowGrowthFactor: bigint;

  /** Peer-to-peer borrow index growth factor (in ray). */
  p2pBorrowGrowthFactor: bigint;
}

export interface MarketSizeDelta {
  /**  The delta amount in pool unit.*/
  scaledDelta: bigint;
  /**  The total peer-to-peer amount in peer-to-peer unit. */
  scaledP2PTotal: bigint;
}
export interface Deltas {
  /** The `MarketSideDelta` related to the supply side. */
  supply: MarketSizeDelta;
  /** The `MarketSideDelta` related to the borrow side. */
  borrow: MarketSizeDelta;
}

export interface IndexesParams {
  /** The last stored pool supply index (in ray). */
  lastSupplyIndexes: MarketSizeIndexes;

  /** The last stored pool borrow index (in ray). */
  lastBorrowIndexes: MarketSizeIndexes;

  /** The current pool supply index (in ray). */
  poolSupplyIndex: bigint;

  /** The current pool borrow index (in ray). */
  poolBorrowIndex: bigint;

  /** The reserve factor percentage (10 000 = 100%). */
  reserveFactor: BigIntish;

  /** The peer-to-peer index cursor (10 000 = 100%). */
  p2pIndexCursor: BigIntish;

  /** The deltas and peer-to-peer amounts. */
  deltas: Deltas;

  /** The amount of proportion idle (in underlying). */
  proportionIdle: bigint;
}

export interface RateParams {
  /** The pool supply rate per year (in ray). */
  poolSupplyRatePerYear: bigint;

  /** The pool borrow rate per year (in ray). */
  poolBorrowRatePerYear: bigint;

  /** The last stored pool index (in ray). */
  poolIndex: bigint;

  /** The last stored peer-to-peer index (in ray). */
  p2pIndex: bigint;

  /** The delta and peer-to-peer amount. */
  delta: MarketSizeDelta;

  /** The index cursor of the given market (in bps). */
  p2pIndexCursor: bigint;

  /** The reserve factor of the given market (in bps). */
  reserveFactor: bigint;

  /** The proportion idle of the given market (in underlying). */
  proportionIdle: bigint;
}

export namespace P2PInterestRates {
  export function computeP2PIndexes({
    p2pIndexCursor,
    lastBorrowIndexes,
    lastSupplyIndexes,
    poolBorrowIndex,
    poolSupplyIndex,
    deltas,
    reserveFactor,
    proportionIdle,
  }: IndexesParams) {
    const {
      poolSupplyGrowthFactor,
      poolBorrowGrowthFactor,
      p2pBorrowGrowthFactor,
      p2pSupplyGrowthFactor,
    } = _computeGrowthFactors(
      poolSupplyIndex,
      poolBorrowIndex,
      lastSupplyIndexes.poolIndex,
      lastBorrowIndexes.poolIndex,
      BigInt(p2pIndexCursor),
      BigInt(reserveFactor),
    );
    const newP2PSupplyIndex = _computeP2PIndex(
      poolSupplyGrowthFactor,
      p2pSupplyGrowthFactor,
      lastSupplyIndexes,
      deltas.supply.scaledDelta,
      deltas.supply.scaledP2PTotal,
      proportionIdle,
    );
    const newP2PBorrowIndex = _computeP2PIndex(
      poolBorrowGrowthFactor,
      p2pBorrowGrowthFactor,
      lastBorrowIndexes,
      deltas.borrow.scaledDelta,
      deltas.borrow.scaledP2PTotal,
      0n,
    );
    return {
      newP2PSupplyIndex,
      newP2PBorrowIndex,
    };
  }

  export function computeP2PSupplyRatePerYear({
    poolSupplyRatePerYear,
    poolBorrowRatePerYear,
    poolIndex,
    p2pIndex,
    p2pIndexCursor,
    reserveFactor,
    proportionIdle,
    delta,
  }: RateParams) {
    let p2pSupplyRate: bigint;

    if (poolSupplyRatePerYear > poolBorrowRatePerYear)
      p2pSupplyRate = poolBorrowRatePerYear;
    else {
      const p2pRate = _weightedAverage(
        poolSupplyRatePerYear,
        poolBorrowRatePerYear,
        p2pIndexCursor,
      );

      p2pSupplyRate =
        p2pRate -
        MorphoAaveMath.percentMul(
          p2pRate - poolBorrowRatePerYear,
          reserveFactor,
        );
    }

    if (delta.scaledDelta > 0n && delta.scaledP2PTotal > 0n) {
      const proportionDelta = MathLib.min(
        MorphoAaveMath.indexDivUp(
          MorphoAaveMath.indexMul(delta.scaledDelta, poolIndex),
          MorphoAaveMath.indexMul(delta.scaledP2PTotal, p2pIndex),
        ),
        MorphoAaveMath.INDEX_ONE - proportionIdle, // To avoid proportionDelta + proportionIdle > 1 with rounding errors.
      );

      p2pSupplyRate =
        MorphoAaveMath.indexMul(
          p2pSupplyRate,
          MorphoAaveMath.INDEX_ONE - proportionDelta - proportionIdle,
        ) +
        MorphoAaveMath.indexMul(poolSupplyRatePerYear, proportionDelta) +
        proportionIdle;
    }

    return p2pSupplyRate;
  }
  export function computeP2PBorrowRatePerYear({
    poolSupplyRatePerYear,
    poolBorrowRatePerYear,
    poolIndex,
    p2pIndex,
    p2pIndexCursor,
    reserveFactor,
    proportionIdle,
    delta,
  }: RateParams) {
    let p2pBorrowRate: bigint;

    if (poolSupplyRatePerYear > poolBorrowRatePerYear)
      p2pBorrowRate = poolBorrowRatePerYear;
    else {
      const p2pRate = _weightedAverage(
        poolSupplyRatePerYear,
        poolBorrowRatePerYear,
        p2pIndexCursor,
      );

      p2pBorrowRate =
        p2pRate +
        MorphoAaveMath.percentMul(
          poolBorrowRatePerYear - p2pRate,
          reserveFactor,
        );
    }

    if (delta.scaledDelta > 0n && delta.scaledP2PTotal > 0n) {
      const proportionDelta = MathLib.min(
        MorphoAaveMath.indexDivUp(
          MorphoAaveMath.indexMul(delta.scaledDelta, poolIndex),
          MorphoAaveMath.indexMul(delta.scaledP2PTotal, p2pIndex),
        ),
        MorphoAaveMath.INDEX_ONE - proportionIdle, // To avoid proportionDelta + proportionIdle > 1 with rounding errors.
      );

      p2pBorrowRate =
        MorphoAaveMath.indexMul(
          p2pBorrowRate,
          MorphoAaveMath.INDEX_ONE - proportionDelta - proportionIdle,
        ) +
        MorphoAaveMath.indexMul(poolBorrowRatePerYear, proportionDelta) +
        proportionIdle;
    }

    return p2pBorrowRate;
  }

  function _computeGrowthFactors(
    newPoolSupplyIndex: bigint,
    newPoolBorrowIndex: bigint,
    lastPoolSupplyIndex: bigint,
    lastPoolBorrowIndex: bigint,
    p2pIndexCursor: bigint,
    reserveFactor: bigint,
  ): GrowthFactors {
    const poolSupplyGrowthFactor = MorphoAaveMath.indexDiv(
      newPoolSupplyIndex,
      lastPoolSupplyIndex,
    );

    const poolBorrowGrowthFactor = MorphoAaveMath.indexDiv(
      newPoolBorrowIndex,
      lastPoolBorrowIndex,
    );

    let p2pSupplyGrowthFactor: bigint;
    let p2pBorrowGrowthFactor: bigint;

    if (poolSupplyGrowthFactor <= poolBorrowGrowthFactor) {
      const p2pGrowthFactor = _weightedAverage(
        poolSupplyGrowthFactor,
        poolBorrowGrowthFactor,
        p2pIndexCursor,
      );

      p2pSupplyGrowthFactor =
        p2pGrowthFactor -
        MorphoAaveMath.percentMul(
          p2pGrowthFactor - poolSupplyGrowthFactor,
          reserveFactor,
        );

      p2pBorrowGrowthFactor =
        p2pGrowthFactor +
        MorphoAaveMath.percentMul(
          poolBorrowGrowthFactor - p2pGrowthFactor,
          reserveFactor,
        );
    } else {
      // The case poolSupplyGrowthFactor > poolBorrowGrowthFactor happens because someone has done a flashloan on Aave:
      // the peer-to-peer growth factors are set to the pool borrow growth factor.
      p2pSupplyGrowthFactor = poolBorrowGrowthFactor;
      p2pBorrowGrowthFactor = poolBorrowGrowthFactor;
    }

    return {
      poolSupplyGrowthFactor,
      p2pSupplyGrowthFactor,
      poolBorrowGrowthFactor,
      p2pBorrowGrowthFactor,
    };
  }

  function _computeP2PIndex(
    poolGrowthFactor: bigint,
    p2pGrowthFactor: bigint,
    lastIndexes: MarketSizeIndexes,
    scaledDelta: bigint,
    scaledP2PTotal: bigint,
    proportionIdle: bigint,
  ): bigint {
    if (scaledP2PTotal === 0n || (scaledDelta === 0n && proportionIdle === 0n))
      return MorphoAaveMath.indexMul(lastIndexes.p2pIndex, p2pGrowthFactor);

    const proportionDelta = MathLib.min(
      MorphoAaveMath.indexDivUp(
        MorphoAaveMath.indexMul(scaledDelta, lastIndexes.poolIndex),
        MorphoAaveMath.indexMul(scaledP2PTotal, lastIndexes.p2pIndex),
      ),
      MorphoAaveMath.INDEX_ONE - proportionIdle, // To avoid proportionDelta + proportionIdle > 1 with rounding errors.
    );

    // Equivalent to:
    // lastP2PIndex * (
    // p2pGrowthFactor * (1 - proportionDelta - proportionIdle) +
    // poolGrowthFactor * proportionDelta +
    // idleGrowthFactor * proportionIdle)
    // Notice that the idleGrowthFactor is always equal to 1 (no interests accumulated).
    return MorphoAaveMath.indexMul(
      lastIndexes.p2pIndex,
      MorphoAaveMath.indexMul(
        p2pGrowthFactor,
        MorphoAaveMath.INDEX_ONE - proportionDelta - proportionIdle,
      ) +
        MorphoAaveMath.indexMul(poolGrowthFactor, proportionDelta) +
        proportionIdle,
    );
  }

  function _weightedAverage(x: bigint, y: bigint, percentage: bigint) {
    const z = MorphoAaveMath.PERCENT_ONE - percentage;
    return (
      (x * z + y * percentage + MorphoAaveMath.PERCENT_ONE / 2n) /
      MorphoAaveMath.PERCENT_ONE
    );
  }
}

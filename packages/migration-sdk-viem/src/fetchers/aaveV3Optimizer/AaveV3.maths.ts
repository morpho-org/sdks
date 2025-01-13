import { type BigIntish, MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { formatUnits, parseUnits } from "viem";

export namespace MorphoAaveMath {
  /** Indexes are expressed in RAY */
  const _indexesDecimals = 27;
  export const INDEX_ONE = parseUnits("1", _indexesDecimals);

  export const indexMul = (a: BigIntish, b: BigIntish) =>
    MathLib.mulDivDown(BigInt(a), BigInt(b), INDEX_ONE);

  export const indexDiv = (a: BigIntish, b: BigIntish) =>
    MathLib.mulDivDown(BigInt(a), INDEX_ONE, BigInt(b));
  export const indexDivUp = (a: BigIntish, b: BigIntish) =>
    MathLib.mulDivDown(BigInt(a) + INDEX_ONE / 2n, INDEX_ONE, BigInt(b));

  export const PERCENT_ONE = parseUnits("1", 4);
  export const percentMul = (a: BigIntish, pct: BigIntish) =>
    MathLib.mulDivDown(BigInt(a), BigInt(pct), PERCENT_ONE);
  export const percentToWad = (pct: bigint) =>
    percentMul(pct, parseUnits("1", 18));

  /**
   * Computes the mid rate depending on the p2p index cursor
   *
   * @param supplyRate in RAY _(27 decimals)_
   * @param borrowRate in RAY _(27 decimals)_
   * @param p2pIndexCursor in BASE_UNITS _(4 decimals)_
   * @returns the raw p2p rate
   */
  function _computeMidRate(
    supplyRate: bigint,
    borrowRate: bigint,
    p2pIndexCursor: bigint,
  ) {
    if (borrowRate < supplyRate) return borrowRate;
    return (
      ((PERCENT_ONE - p2pIndexCursor) * supplyRate +
        borrowRate * p2pIndexCursor) /
      PERCENT_ONE
    );
  }

  /**
   * Computes P2P Rates considering deltas, idle liquidity and fees
   *
   * @param poolSupplyRate in RAY _(27 decimals)_
   * @param poolBorrowRate in RAY _(27 decimals)_
   * @param p2pIndexCursor in BASE_UNITS _(4 decimals)_
   * @param reserveFactor in  BASE_UNITS _(4 decimals)_
   * @param supplyProportionDelta in RAY _(27 decimals)_
   * @param borrowProportionDelta in RAY _(27 decimals)_
   * @param proportionIdle in RAY _(27 decimals)_
   * @returns the computed P2P rates in RAY _(27 decimals)_
   */
  function _computeP2PRates(
    poolSupplyRate: bigint,
    poolBorrowRate: bigint,
    p2pIndexCursor: bigint,
    reserveFactor = 0n,
    supplyProportionDelta = 0n,
    borrowProportionDelta = 0n,
    proportionIdle = 0n,
  ) {
    const midRate = _computeMidRate(
      poolSupplyRate,
      poolBorrowRate,
      p2pIndexCursor,
    );

    const supplyRatesWithFees =
      midRate - percentMul(midRate - poolSupplyRate, reserveFactor);
    const borrowRatesWithFees =
      midRate + percentMul(poolBorrowRate - midRate, reserveFactor);

    return {
      p2pSupplyRate:
        indexMul(
          INDEX_ONE - supplyProportionDelta - proportionIdle,
          supplyRatesWithFees,
        ) + indexMul(supplyProportionDelta, poolSupplyRate),
      p2pBorrowRate:
        indexMul(INDEX_ONE - borrowProportionDelta, borrowRatesWithFees) +
        indexMul(borrowProportionDelta, poolBorrowRate),
      midRate,
    };
  }

  /**
   * Transforms a **Yearly** rate into an APY
   * @param yearlyRate in RAY _(27 decimals)_
   * @returns the compounded APY in BASE_UNITS _(4 decimals)_
   */
  function _rateToAPY(yearlyRate: bigint) {
    const ratePerSeconds = yearlyRate / Time.s.from.y(1n);
    return compoundInterests(ratePerSeconds, Time.s.from.y(1));
  }

  /**
   * Compound interests over a specific duration
   * @param rate rate over one period in RAY _(27 decimals)_
   * @param duration number of periods
   */
  export function compoundInterests(rate: bigint, duration: number) {
    return parseUnits(
      ((1 + +formatUnits(rate, _indexesDecimals)) ** duration - 1).toFixed(4),
      4,
    );
  }

  /**
   * Computes APYs from rates
   *
   * @param poolSupplyRate in RAY _(27 decimals)_
   * @param poolBorrowRate in RAY _(27 decimals)_
   * @param p2pIndexCursor in BASE_UNITS _(4 decimals)_
   * @param supplyProportionDelta in RAY _(27 decimals)_
   * @param borrowProportionDelta in RAY _(27 decimals)_
   * @param proportionIdle in RAY _(27 decimals)_
   * @param reserveFactor in BASE_UNITS _(4 decimals)_
   * @returns the computed APYs in BASE_UNITS _(4 decimals)_
   */
  export function computeApysFromRates(
    poolSupplyRate: bigint,
    poolBorrowRate: bigint,
    p2pIndexCursor: BigIntish,
    supplyProportionDelta = 0n,
    borrowProportionDelta = 0n,
    proportionIdle = 0n,
    reserveFactor: BigIntish = 0n,
  ) {
    const { p2pBorrowRate, p2pSupplyRate, midRate } = _computeP2PRates(
      poolSupplyRate,
      poolBorrowRate,
      BigInt(p2pIndexCursor),
      BigInt(reserveFactor),
      supplyProportionDelta,
      borrowProportionDelta,
      proportionIdle,
    );

    return {
      poolBorrowAPY: _rateToAPY(poolBorrowRate),
      poolSupplyAPY: _rateToAPY(poolSupplyRate),
      p2pSupplyAPY: _rateToAPY(p2pSupplyRate),
      p2pBorrowAPY: _rateToAPY(p2pBorrowRate),
      p2pAPY: _rateToAPY(midRate),
    };
  }
}

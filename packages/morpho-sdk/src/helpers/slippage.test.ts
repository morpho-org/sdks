import { Market, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { WethUsdsMarketV1 } from "../../test/fixtures/marketV1.js";
import {
  ExcessiveSlippageToleranceError,
  ShareDivideByZeroError,
} from "../types/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "./constant.js";
import {
  computeMaxRepaySharePrice,
  computeMinBorrowSharePrice,
} from "./slippage.js";

/** 1:1 share-to-asset ratio market for predictable results. */
const normalMarket = new Market({
  params: new MarketParams(WethUsdsMarketV1),
  totalSupplyAssets: 10n ** 24n,
  totalBorrowAssets: 10n ** 24n,
  totalSupplyShares: 10n ** 24n,
  totalBorrowShares: 10n ** 24n,
  lastUpdate: 1_700_000_000n,
  fee: 0n,
  price: 10n ** 36n,
});

/**
 * Extreme market: 1 share backs 10^30 assets.
 * Used to trigger MAX_ABSOLUTE_SHARE_PRICE cap and zero-shares edge case.
 */
const highSharePriceMarket = new Market({
  params: new MarketParams(WethUsdsMarketV1),
  totalSupplyAssets: 10n ** 30n,
  totalBorrowAssets: 10n ** 30n,
  totalSupplyShares: 10n ** 30n,
  totalBorrowShares: 1n,
  lastUpdate: 1_700_000_000n,
  fee: 0n,
  price: 10n ** 36n,
});

const slippage03 = (3n * MathLib.WAD) / 1000n; // 0.3%

describe("computeMinBorrowSharePrice", () => {
  test("should throw ShareDivideByZeroError when borrowAmount is zero", () => {
    expect(() =>
      computeMinBorrowSharePrice({
        borrowAmount: 0n,
        market: normalMarket,
        slippageTolerance: slippage03,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should return a positive share price for a normal borrow", () => {
    const result = computeMinBorrowSharePrice({
      borrowAmount: 10n ** 18n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBeGreaterThan(0n);
  });

  test("should return a lower price with higher slippage tolerance", () => {
    const amount = 10n ** 18n;
    const low = computeMinBorrowSharePrice({
      borrowAmount: amount,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    const high = computeMinBorrowSharePrice({
      borrowAmount: amount,
      market: normalMarket,
      slippageTolerance: (10n * MathLib.WAD) / 1000n, // 1%
    });
    expect(high).toBeLessThan(low);
  });

  test("should return approximately RAY with zero slippage on a 1:1 market", () => {
    const result = computeMinBorrowSharePrice({
      borrowAmount: 10n ** 18n,
      market: normalMarket,
      slippageTolerance: 0n,
    });
    // With virtual shares offset, result is close to but not exactly RAY.
    expect(result).toBeGreaterThan((MathLib.RAY * 99n) / 100n);
    expect(result).toBeLessThanOrEqual(MathLib.RAY);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage equals WAD", () => {
    expect(() =>
      computeMinBorrowSharePrice({
        borrowAmount: 10n ** 18n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage exceeds WAD", () => {
    expect(() =>
      computeMinBorrowSharePrice({
        borrowAmount: 10n ** 18n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD + 1n,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

describe("computeMaxRepaySharePrice", () => {
  test("should compute max share price via by-assets path", () => {
    const result = computeMaxRepaySharePrice({
      repayAssets: 10n ** 18n,
      repayShares: 0n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBeGreaterThan(0n);
  });

  test("should compute max share price via by-shares path", () => {
    const result = computeMaxRepaySharePrice({
      repayAssets: 0n,
      repayShares: 10n ** 18n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBeGreaterThan(0n);
  });

  test("should return a higher price with higher slippage tolerance", () => {
    const low = computeMaxRepaySharePrice({
      repayAssets: 10n ** 18n,
      repayShares: 0n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    const high = computeMaxRepaySharePrice({
      repayAssets: 10n ** 18n,
      repayShares: 0n,
      market: normalMarket,
      slippageTolerance: (10n * MathLib.WAD) / 1000n,
    });
    expect(high).toBeGreaterThan(low);
  });

  test("should cap at MAX_ABSOLUTE_SHARE_PRICE for extreme share prices", () => {
    const result = computeMaxRepaySharePrice({
      repayAssets: 0n,
      repayShares: 1n,
      market: highSharePriceMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBe(MAX_ABSOLUTE_SHARE_PRICE);
  });

  test("should throw ShareDivideByZeroError when computed shares is zero", () => {
    expect(() =>
      computeMaxRepaySharePrice({
        repayAssets: 1n,
        repayShares: 0n,
        market: highSharePriceMarket,
        slippageTolerance: slippage03,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage equals WAD", () => {
    expect(() =>
      computeMaxRepaySharePrice({
        repayAssets: 10n ** 18n,
        repayShares: 0n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage exceeds WAD", () => {
    expect(() =>
      computeMaxRepaySharePrice({
        repayAssets: 10n ** 18n,
        repayShares: 0n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD + 1n,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

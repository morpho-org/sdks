import { Market, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { WethUsdsBlue } from "../../test/fixtures/blue.js";
import {
  ExcessiveSlippageToleranceError,
  NonPositiveInputError,
  ShareDivideByZeroError,
  VaultV2ForceWithdrawZeroSharePriceError,
} from "../types/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "./constant.js";
import {
  computeMaxRepaySharePrice,
  computeMaxSupplySharePrice,
  computeMinBorrowSharePrice,
  computeMinForceWithdrawSharePrice,
  computeMinWithdrawSharePrice,
} from "./slippage.js";

/** 1:1 share-to-asset ratio market for predictable results. */
const normalMarket = new Market({
  params: new MarketParams(WethUsdsBlue),
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
  params: new MarketParams(WethUsdsBlue),
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

describe("computeMaxSupplySharePrice", () => {
  test("should return a positive share price for a normal supply", () => {
    const result = computeMaxSupplySharePrice({
      supplyAssets: 10n ** 18n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBeGreaterThan(0n);
  });

  test("should return a higher price with higher slippage tolerance", () => {
    const amount = 10n ** 18n;
    const low = computeMaxSupplySharePrice({
      supplyAssets: amount,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    const high = computeMaxSupplySharePrice({
      supplyAssets: amount,
      market: normalMarket,
      slippageTolerance: (10n * MathLib.WAD) / 1000n,
    });
    expect(high).toBeGreaterThan(low);
  });

  test("should cap at MAX_ABSOLUTE_SHARE_PRICE for extreme share prices", () => {
    // Market where 1 share backs 10^30 assets on the supply side.
    const extreme = new Market({
      params: new MarketParams(WethUsdsBlue),
      totalSupplyAssets: 10n ** 30n,
      totalBorrowAssets: 10n ** 30n,
      totalSupplyShares: 1n,
      totalBorrowShares: 10n ** 30n,
      lastUpdate: 1_700_000_000n,
      fee: 0n,
      price: 10n ** 36n,
    });
    const result = computeMaxSupplySharePrice({
      supplyAssets: 10n ** 30n,
      market: extreme,
      slippageTolerance: slippage03,
    });
    expect(result).toBe(MAX_ABSOLUTE_SHARE_PRICE);
  });

  test("should throw ShareDivideByZeroError when expected shares round to zero", () => {
    // Market with very high share price so a tiny asset supply rounds shares to 0 (Down).
    const extreme = new Market({
      params: new MarketParams(WethUsdsBlue),
      totalSupplyAssets: 10n ** 30n,
      totalBorrowAssets: 10n ** 30n,
      totalSupplyShares: 1n,
      totalBorrowShares: 10n ** 30n,
      lastUpdate: 1_700_000_000n,
      fee: 0n,
      price: 10n ** 36n,
    });
    expect(() =>
      computeMaxSupplySharePrice({
        supplyAssets: 1n,
        market: extreme,
        slippageTolerance: slippage03,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage equals WAD", () => {
    expect(() =>
      computeMaxSupplySharePrice({
        supplyAssets: 10n ** 18n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage exceeds WAD", () => {
    expect(() =>
      computeMaxSupplySharePrice({
        supplyAssets: 10n ** 18n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD + 1n,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

describe("computeMinWithdrawSharePrice", () => {
  test("should compute min share price via by-assets path", () => {
    const result = computeMinWithdrawSharePrice({
      withdrawAssets: 10n ** 18n,
      withdrawShares: 0n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBeGreaterThan(0n);
  });

  test("should compute min share price via by-shares path", () => {
    const result = computeMinWithdrawSharePrice({
      withdrawAssets: 0n,
      withdrawShares: 10n ** 18n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    expect(result).toBeGreaterThan(0n);
  });

  test("should return a lower price with higher slippage tolerance", () => {
    const low = computeMinWithdrawSharePrice({
      withdrawAssets: 10n ** 18n,
      withdrawShares: 0n,
      market: normalMarket,
      slippageTolerance: slippage03,
    });
    const high = computeMinWithdrawSharePrice({
      withdrawAssets: 10n ** 18n,
      withdrawShares: 0n,
      market: normalMarket,
      slippageTolerance: (10n * MathLib.WAD) / 1000n,
    });
    expect(high).toBeLessThan(low);
  });

  test("should throw ShareDivideByZeroError when computed shares is zero", () => {
    // 1:1 market — supplying 0 assets yields 0 shares.
    expect(() =>
      computeMinWithdrawSharePrice({
        withdrawAssets: 0n,
        withdrawShares: 0n,
        market: normalMarket,
        slippageTolerance: slippage03,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage equals WAD", () => {
    expect(() =>
      computeMinWithdrawSharePrice({
        withdrawAssets: 10n ** 18n,
        withdrawShares: 0n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });

  test("should throw ExcessiveSlippageToleranceError when slippage exceeds WAD", () => {
    expect(() =>
      computeMinWithdrawSharePrice({
        withdrawAssets: 10n ** 18n,
        withdrawShares: 0n,
        market: normalMarket,
        slippageTolerance: MathLib.WAD + 1n,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

describe("computeMinForceWithdrawSharePrice", () => {
  test("default", () => {
    // 1000 assets over 1000 shares at a 0.3% tolerance.
    expect(
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: 1_000n,
        sharesBurnt: 1_000n,
        slippageTolerance: slippage03,
      }),
    ).toBe(MathLib.wToRay(MathLib.WAD - slippage03));
  });

  test("behavior: scales down with the tolerance", () => {
    const tight = computeMinForceWithdrawSharePrice({
      withdrawnAssets: 1_000n,
      sharesBurnt: 1_000n,
      slippageTolerance: 0n,
    });
    const loose = computeMinForceWithdrawSharePrice({
      withdrawnAssets: 1_000n,
      sharesBurnt: 1_000n,
      slippageTolerance: slippage03,
    });

    expect(tight).toBe(MathLib.RAY);
    expect(loose).toBeLessThan(tight);
  });

  test("behavior: a penalty lowers the bound below the raw share price", () => {
    // 51 assets debited, 50 withdrawn: the penalty is deducted from what the user receives.
    const withPenalty = computeMinForceWithdrawSharePrice({
      withdrawnAssets: 50n,
      sharesBurnt: 51n,
      slippageTolerance: 0n,
    });

    expect(withPenalty).toBeLessThan(MathLib.RAY);
  });

  test("behavior: rounds the bound down so a faithful snapshot never trips the check", () => {
    const minSharePriceE27 = computeMinForceWithdrawSharePrice({
      withdrawnAssets: 50n,
      sharesBurnt: 53n,
      slippageTolerance: 0n,
    });

    // The on-chain check is `mulDivDown(withdrawn, RAY, sharesBurnt) >= minSharePriceE27`.
    expect(MathLib.mulDivDown(50n, MathLib.RAY, 53n)).toBeGreaterThanOrEqual(
      minSharePriceE27,
    );
  });

  test("error: NonPositiveInputError on zero withdrawn assets", () => {
    expect(() =>
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: 0n,
        sharesBurnt: 1_000n,
        slippageTolerance: slippage03,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError on zero shares burnt", () => {
    expect(() =>
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: 1_000n,
        sharesBurnt: 0n,
        slippageTolerance: slippage03,
      }),
    ).toThrow(NonPositiveInputError);
  });

  // Security invariant (root AGENTS.md §5): the contract reads `minSharePriceE27 == 0` as "no
  // bound", so a floor that rounds down to zero must fail loudly rather than ship an unbounded exit.
  test("error: VaultV2ForceWithdrawZeroSharePriceError when the floor rounds down to zero", () => {
    // One wei withdrawn against a burn larger than RAY cannot price above zero at 1e27 scale.
    expect(() =>
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: 1n,
        sharesBurnt: MathLib.RAY,
        slippageTolerance: slippage03,
      }),
    ).toThrow(VaultV2ForceWithdrawZeroSharePriceError);
  });

  test("behavior: the smallest non-zero floor is returned rather than rejected", () => {
    // The largest burn one withdrawn wei can still price above zero at 1e27 scale; one wei more
    // rounds the floor to zero, which is the case the test above pins.
    expect(
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: 1n,
        sharesBurnt: MathLib.wToRay(MathLib.WAD - slippage03),
        slippageTolerance: slippage03,
      }),
    ).toBe(1n);
  });

  test("error: ExcessiveSlippageToleranceError when slippage reaches WAD", () => {
    expect(() =>
      computeMinForceWithdrawSharePrice({
        withdrawnAssets: 1_000n,
        sharesBurnt: 1_000n,
        slippageTolerance: MathLib.WAD,
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

import {
  type AccrualVault,
  Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { WethUsdsBlue } from "../../test/fixtures/blue.js";
import {
  ExcessiveSlippageToleranceError,
  ShareDivideByZeroError,
} from "../types/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "./constant.js";
import {
  computeMaxRepaySharePrice,
  computeMaxSupplySharePrice,
  computeMinBorrowSharePrice,
  computeMinWithdrawSharePrice,
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
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

describe("computeVaultMaxSharePrice", () => {
  test("behavior: accrues through the supplied bundles deadline", () => {
    const deadline = 1_800_010_800n;
    let accruedAt: bigint | undefined;
    const vaultData = {
      accrueInterest: (timestamp: bigint) => {
        accruedAt = timestamp;
        return { toShares: (assets: bigint) => assets };
      },
    } as unknown as AccrualVault;

    computeVaultMaxSharePrice({
      vaultData,
      deadline,
      assets: 1n,
      slippageTolerance: 0n,
    });

    expect(accruedAt).toBe(deadline);
  });

  test("behavior: is monotonic in slippage tolerance", () => {
    const vaultData = {
      accrueInterest: () => ({ toShares: (assets: bigint) => assets }),
    } as unknown as AccrualVault;
    fc.assert(
      fc.property(
        fc.record({
          assets: fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }),
          low: fc.bigInt({ min: 0n, max: MathLib.WAD / 20n }),
          delta: fc.bigInt({ min: 0n, max: MathLib.WAD / 20n }),
        }),
        ({ assets, low, delta }) => {
          const high = low + delta;
          expect(
            computeVaultMaxSharePrice({
              vaultData,
              deadline: 1_800_007_200n,
              assets,
              slippageTolerance: high,
            }),
          ).toBeGreaterThanOrEqual(
            computeVaultMaxSharePrice({
              vaultData,
              deadline: 1_800_007_200n,
              assets,
              slippageTolerance: low,
            }),
          );
        },
      ),
      { numRuns: 100, seed: 20_260_912 },
    );
  });
});

describe("computeVaultMaxShareAllowance", () => {
  const vaultData = (lostAssets?: bigint) =>
    ({
      lostAssets,
      toShares: () => 10n,
      accrueInterest: () => ({ toShares: () => 12n }),
    }) as unknown as AccrualVault;

  test("behavior: widens MetaMorpho 1.0 against loss realization", () => {
    expect(
      computeVaultMaxShareAllowance({
        vaultData: vaultData(),
        deadline: 1_900_000_000n,
        assets: 10n,
        slippageTolerance: MathLib.WAD / 10n,
      }),
    ).toBe(14n);
  });

  test("behavior: keeps the MetaMorpho 1.1 lost-assets-clamped cap exact", () => {
    expect(
      computeVaultMaxShareAllowance({
        vaultData: vaultData(0n),
        deadline: 1_900_000_000n,
        assets: 10n,
        slippageTolerance: MathLib.WAD / 10n,
      }),
    ).toBe(12n);
  });
});

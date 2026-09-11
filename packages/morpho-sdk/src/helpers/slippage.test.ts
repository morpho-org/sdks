import {
  type AccrualVault,
  AccrualVaultV2,
  Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import fc from "fast-check";
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

describe("computeVaultMaxSharePrice", () => {
  test("behavior: accrues through the supplied bundles deadline", () => {
    const deadline = 1_800_010_800n;
    let accruedAt: bigint | undefined;
    const vaultData = {
      toShares: (assets: bigint) => assets,
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

  test("behavior: previews shares rounding down, matching the on-chain ERC-4626 deposit()", () => {
    const roundings: ("Up" | "Down")[] = [];
    const toShares = (_assets: bigint, rounding: "Up" | "Down") => {
      roundings.push(rounding);
      // Vault V1's own default (`"Up"`) would preview 3n here; the on-chain
      // `vault.deposit(...)` share count is rounded down, i.e. 2n.
      return rounding === "Down" ? 2n : 3n;
    };
    const vaultData = {
      toShares,
      accrueInterest: () => ({ toShares }),
    } as unknown as AccrualVault;

    const maxSharePrice = computeVaultMaxSharePrice({
      vaultData,
      deadline: 1_900_000_000n,
      assets: 7n,
      slippageTolerance: 0n,
    });

    expect(roundings).toEqual(["Down", "Down"]);
    // Rounding down previews fewer shares, which loosens (raises) the bound relative to the
    // `"Up"` default; the reverse would falsely tighten the bound and revert small V1 deposits
    // at zero slippage tolerance.
    expect(maxSharePrice).toBe(
      MathLib.mulDivUp(7n, MathLib.wToRay(MathLib.WAD), 2n),
    );
  });

  test("behavior: is monotonic in slippage tolerance", () => {
    const vaultData = {
      toShares: (assets: bigint) => assets,
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

  test("behavior: bounds a declining Vault V2 price at the pre-accrual snapshot", () => {
    // An idle Vault V2 still charges its management fee, minting shares against an unchanged
    // `_totalAssets`: the deadline preview yields *more* shares, i.e. a *lower* price, than the
    // current one. Bounding on the deadline snapshot alone would false-revert `SlippageExceeded`
    // for a deposit included before the deadline.
    const vaultData = Object.assign(Object.create(AccrualVaultV2.prototype), {
      lastUpdate: 1_800_000_000n,
      toShares: () => 100n,
      accrueInterest: () => ({ vault: { toShares: () => 110n } }),
    }) as AccrualVaultV2;

    expect(
      computeVaultMaxSharePrice({
        vaultData,
        deadline: 1_900_000_000n,
        assets: 100n,
        slippageTolerance: 0n,
      }),
    ).toBe(MathLib.mulDivUp(100n, MathLib.wToRay(MathLib.WAD), 100n));
  });

  test("behavior: keeps a rising price bounded on the deadline-accrued preview", () => {
    // The common case: interest raises the price, so the deadline preview yields fewer shares
    // and remains the binding endpoint.
    const vaultData = {
      toShares: () => 110n,
      accrueInterest: () => ({ toShares: () => 100n }),
    } as unknown as AccrualVault;

    expect(
      computeVaultMaxSharePrice({
        vaultData,
        deadline: 1_900_000_000n,
        assets: 100n,
        slippageTolerance: 0n,
      }),
    ).toBe(MathLib.mulDivUp(100n, MathLib.wToRay(MathLib.WAD), 100n));
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

  test.each(["MetaMorpho 1.0", "Vault V2"] as const)(
    "behavior: covers the full permitted price decline for %s",
    (version) => {
      const preview = { toShares: () => 100n };
      const snapshot =
        version === "Vault V2"
          ? (Object.assign(Object.create(AccrualVaultV2.prototype), {
              ...preview,
              lastUpdate: 1_800_000_000n,
              accrueInterest: () => ({ vault: preview }),
            }) as AccrualVaultV2)
          : ({
              ...preview,
              accrueInterest: () => preview,
            } as unknown as AccrualVault);

      expect(
        computeVaultMaxShareAllowance({
          vaultData: snapshot,
          deadline: 1_900_000_000n,
          assets: 100n,
          slippageTolerance: MathLib.WAD / 10n,
        }),
      ).toBe(112n);
    },
  );

  test("behavior: authorizes the minimum whole-share cap covering the price floor", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }),
        fc.bigInt({ min: 0n, max: MathLib.WAD / 10n }),
        (shares, slippageTolerance) => {
          const preview = { toShares: () => shares };
          const cap = computeVaultMaxShareAllowance({
            vaultData: {
              ...preview,
              accrueInterest: () => preview,
            } as unknown as AccrualVault,
            deadline: 1_900_000_000n,
            assets: shares,
            slippageTolerance,
          });
          const priceFloor = MathLib.WAD - slippageTolerance;
          expect(cap * priceFloor).toBeGreaterThanOrEqual(shares * MathLib.WAD);
          expect((cap - 1n) * priceFloor).toBeLessThan(shares * MathLib.WAD);
        },
      ),
      { numRuns: 100, seed: 20_260_907 },
    );
  });
});

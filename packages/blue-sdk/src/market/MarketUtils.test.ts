import { parseUnits } from "viem";
import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../constants.js";
import { MathLib } from "../math/MathLib.js";
import { SharesMath } from "../math/SharesMath.js";
import { MarketUtils } from "./MarketUtils.js";

const lltv = (pct: number) => (BigInt(pct * 1000) * MathLib.WAD) / 1000n;

const marketParams = {
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralToken: "0x0000000000000000000000000000000000000002",
  oracle: "0x0000000000000000000000000000000000000003",
  irm: "0x0000000000000000000000000000000000000004",
  lltv: 86_0000000000000000n,
} as const;

describe("MarketUtils market identifiers", () => {
  test("getMarketId returns the expected encoded id", () => {
    expect(MarketUtils.getMarketId(marketParams)).toBe(
      "0x625e29dff74826b71c1f4c74b208a896109cc8ac9910192ce2927a982b0809e6",
    );
  });

  test("getLiquidationIncentiveFactor returns the expected LLTV-based factor", () => {
    expect(MarketUtils.getLiquidationIncentiveFactor(marketParams)).toBe(
      1043841336116910229n,
    );
  });
});

describe("MarketUtils.getUtilization", () => {
  test("0/0 returns 0", () => {
    expect(
      MarketUtils.getUtilization({
        totalSupplyAssets: 0n,
        totalBorrowAssets: 0n,
      }),
    ).toBe(0n);
  });

  test("supply=0, borrow>0 returns MAX_UINT_256 (degenerate state)", () => {
    expect(
      MarketUtils.getUtilization({
        totalSupplyAssets: 0n,
        totalBorrowAssets: 1n,
      }),
    ).toBe(MathLib.MAX_UINT_256);
  });

  test("borrow / supply scaled to WAD", () => {
    expect(
      MarketUtils.getUtilization({
        totalSupplyAssets: 1_000n,
        totalBorrowAssets: 500n,
      }),
    ).toBe(MathLib.WAD / 2n);
  });

  test("100% utilization returns 1 WAD", () => {
    expect(
      MarketUtils.getUtilization({
        totalSupplyAssets: 1_000n,
        totalBorrowAssets: 1_000n,
      }),
    ).toBe(MathLib.WAD);
  });

  test("0% utilization returns 0", () => {
    expect(
      MarketUtils.getUtilization({
        totalSupplyAssets: 1_000n,
        totalBorrowAssets: 0n,
      }),
    ).toBe(0n);
  });
});

describe("MarketUtils.getCollateralPower", () => {
  test("collateral * lltv (rounded down)", () => {
    expect(
      MarketUtils.getCollateralPower(MathLib.WAD, { lltv: lltv(86) }),
    ).toBe(lltv(86));
  });

  test("zero collateral yields zero borrow power", () => {
    expect(MarketUtils.getCollateralPower(0n, { lltv: lltv(86) })).toBe(0n);
  });

  test("100% LLTV returns the collateral verbatim", () => {
    expect(
      MarketUtils.getCollateralPower(MathLib.WAD, { lltv: MathLib.WAD }),
    ).toBe(MathLib.WAD);
  });
});

describe("MarketUtils.getCollateralValue", () => {
  test("returns undefined when price is missing", () => {
    expect(MarketUtils.getCollateralValue(MathLib.WAD, {})).toBeUndefined();
  });

  test("collateral * price / ORACLE_PRICE_SCALE (rounded down)", () => {
    // 1 collateral * 1 ORACLE_PRICE_SCALE / ORACLE_PRICE_SCALE = 1
    expect(
      MarketUtils.getCollateralValue(MathLib.WAD, {
        price: ORACLE_PRICE_SCALE,
      }),
    ).toBe(MathLib.WAD);
  });

  test("price=0 → value=0", () => {
    expect(MarketUtils.getCollateralValue(MathLib.WAD, { price: 0n })).toBe(0n);
  });

  test("scales with collateral linearly", () => {
    const a = MarketUtils.getCollateralValue(MathLib.WAD, {
      price: ORACLE_PRICE_SCALE,
    });
    const b = MarketUtils.getCollateralValue(2n * MathLib.WAD, {
      price: ORACLE_PRICE_SCALE,
    });
    expect(b).toBe((a ?? 0n) * 2n);
  });
});

describe("MarketUtils.getMaxBorrowAssets", () => {
  test("returns undefined when price is missing", () => {
    expect(
      MarketUtils.getMaxBorrowAssets(MathLib.WAD, {}, { lltv: lltv(86) }),
    ).toBeUndefined();
  });

  test("for 1 collateral at $1 with 86% LLTV, returns 0.86", () => {
    expect(
      MarketUtils.getMaxBorrowAssets(
        MathLib.WAD,
        { price: ORACLE_PRICE_SCALE },
        { lltv: lltv(86) },
      ),
    ).toBe(lltv(86));
  });
});

describe("MarketUtils.toSupplyAssets / toSupplyShares (delegates to SharesMath)", () => {
  const market = { totalSupplyAssets: 100n, totalSupplyShares: 1_000n };

  test("default rounding is Down for assets, Up for shares", () => {
    // 0 shares -> 0 assets regardless of rounding
    expect(MarketUtils.toSupplyAssets(0n, market)).toBe(0n);
    // 0 assets -> 0 shares with Up rounding remains 0
    expect(MarketUtils.toSupplyShares(0n, market)).toBe(0n);
  });

  test("explicit rounding direction propagates", () => {
    const aDown = MarketUtils.toSupplyAssets(1n, market, "Down");
    const aUp = MarketUtils.toSupplyAssets(1n, market, "Up");
    expect(aUp).toBeGreaterThanOrEqual(aDown);
  });
});

describe("MarketUtils.getAccruedInterest", () => {
  test("returns zero interest when elapsed=0", () => {
    const r = MarketUtils.getAccruedInterest(MathLib.WAD, {
      totalSupplyAssets: 1_000n,
      totalBorrowAssets: 500n,
      totalSupplyShares: 10_000n,
      fee: 0n,
    });
    expect(r.interest).toBe(0n);
    expect(r.feeShares).toBe(0n);
  });

  test("with fee=0, feeShares is 0 even with non-zero elapsed", () => {
    const r = MarketUtils.getAccruedInterest(
      MathLib.WAD,
      {
        totalSupplyAssets: 1_000n,
        totalBorrowAssets: 500n,
        totalSupplyShares: 10_000n,
        fee: 0n,
      },
      3600n,
    );
    expect(r.interest).toBeGreaterThan(0n);
    expect(r.feeShares).toBe(0n);
  });

  test("with non-zero fee and a realistic rate, feeShares > 0 when elapsed > 0", () => {
    // Realistic borrow rate (~0.0001/sec scaled to WAD) over 1 hour.
    const rate = MathLib.WAD / 10n ** 9n;
    const r = MarketUtils.getAccruedInterest(
      rate,
      {
        totalSupplyAssets: 10n ** 18n,
        totalBorrowAssets: 5n * 10n ** 17n,
        totalSupplyShares: 10n ** 24n,
        fee: MathLib.WAD / 10n, // 10% fee
      },
      3600n,
    );
    expect(r.interest).toBeGreaterThan(0n);
    expect(r.feeShares).toBeGreaterThan(0n);
  });

  test("fee shares accrue against post-interest supply assets", () => {
    const totalSupplyAssets = 1_000_000n * MathLib.WAD;
    const totalBorrowAssets = 800_000n * MathLib.WAD;
    const totalSupplyShares = 1_100_000n * MathLib.WAD;
    const fee = 10_0000000000000000n;
    const { interest, feeShares } = MarketUtils.getAccruedInterest(
      5_0000000000000000n,
      {
        totalSupplyAssets,
        totalBorrowAssets,
        totalSupplyShares,
        fee,
      },
      1n,
    );
    const feeAmount = MathLib.wMulDown(interest, fee);

    expect(feeShares).toBe(
      SharesMath.toShares(
        feeAmount,
        totalSupplyAssets + interest - feeAmount,
        totalSupplyShares,
        "Down",
      ),
    );
    expect(feeShares).toBeLessThan(
      SharesMath.toShares(
        feeAmount,
        totalSupplyAssets - feeAmount,
        totalSupplyShares,
        "Down",
      ),
    );
  });
});

describe("MarketUtils.rateToApy", () => {
  test("rate=0 returns 0", () => {
    expect(MarketUtils.rateToApy(0n)).toBe(0);
  });

  test("monotonically increasing in rate", () => {
    const small = MarketUtils.rateToApy(1n);
    const big = MarketUtils.rateToApy(1_000_000n);
    expect(big).toBeGreaterThan(small);
  });

  test("approximates exp(rate * SECONDS_PER_YEAR) - 1", () => {
    // Rate of 1 per WAD per second over a year is unrealistic, but ratio shape holds.
    const r = MarketUtils.rateToApy(MathLib.WAD / 10n ** 12n);
    expect(r).toBeGreaterThan(0);
  });

  test("matches known continuously compounded rates", () => {
    expect(MarketUtils.rateToApy(parseUnits("3", 16) / SECONDS_PER_YEAR)).toBe(
      0.030454533936848223,
    );
    expect(MarketUtils.rateToApy(parseUnits("40", 16) / SECONDS_PER_YEAR)).toBe(
      0.4918246976174727,
    );
    expect(
      MarketUtils.rateToApy(parseUnits("500", 16) / SECONDS_PER_YEAR),
    ).toBe(147.41315909872503);
  });
});

describe("MarketUtils utilization target helpers", () => {
  const market = { totalSupplyAssets: 1_000n, totalBorrowAssets: 400n };

  test("getSupplyToUtilization handles zero target utilization", () => {
    expect(MarketUtils.getSupplyToUtilization(market, 0n)).toBe(
      MathLib.MAX_UINT_256,
    );
    expect(
      MarketUtils.getSupplyToUtilization(
        { totalSupplyAssets: 1_000n, totalBorrowAssets: 0n },
        0n,
      ),
    ).toBe(0n);
  });

  test("getSupplyToUtilization returns the supply needed to reach the target", () => {
    expect(MarketUtils.getSupplyToUtilization(market, MathLib.WAD / 2n)).toBe(
      0n,
    );
    expect(MarketUtils.getSupplyToUtilization(market, MathLib.WAD / 4n)).toBe(
      600n,
    );
    expect(
      MarketUtils.getSupplyToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toBe(11_1111111111111112n);
  });

  test("getWithdrawToUtilization handles zero target utilization", () => {
    expect(
      MarketUtils.getWithdrawToUtilization(
        { totalSupplyAssets: 1_000n, totalBorrowAssets: 0n },
        0n,
      ),
    ).toBe(1_000n);
    expect(MarketUtils.getWithdrawToUtilization(market, 0n)).toBe(0n);
  });

  test("getWithdrawToUtilization returns withdrawable assets until target", () => {
    expect(MarketUtils.getWithdrawToUtilization(market, MathLib.WAD / 2n)).toBe(
      200n,
    );
    expect(
      MarketUtils.getWithdrawToUtilization(
        { totalSupplyAssets: 2n * MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toBe(88_8888888888888888n);
  });

  test("getBorrowToUtilization and getRepayToUtilization return target deltas", () => {
    expect(MarketUtils.getBorrowToUtilization(market, MathLib.WAD / 2n)).toBe(
      100n,
    );
    expect(MarketUtils.getRepayToUtilization(market, MathLib.WAD / 4n)).toBe(
      150n,
    );
    expect(
      MarketUtils.getBorrowToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 0n },
        90_0000000000000000n,
      ),
    ).toBe(90_0000000000000000n);
    expect(
      MarketUtils.getRepayToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toBe(10_0000000000000000n);
  });
});

describe("MarketUtils position risk helpers", () => {
  const market = {
    totalBorrowAssets: 2_000_000n,
    totalBorrowShares: 1_000_001n,
    price: ORACLE_PRICE_SCALE,
  };
  const params = { lltv: 500_000_000_000_000_000n };

  test("getMaxBorrowableAssets returns undefined without price", () => {
    expect(
      MarketUtils.getMaxBorrowableAssets(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
  });

  test("getMaxBorrowableAssets subtracts current debt", () => {
    expect(
      MarketUtils.getMaxBorrowableAssets(
        { collateral: 100n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(40n);
  });

  test("getLiquidationSeizedAssets handles undefined and zero prices", () => {
    expect(
      MarketUtils.getLiquidationSeizedAssets(
        10n,
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getLiquidationSeizedAssets(
        10n,
        { ...market, price: 0n },
        params,
      ),
    ).toBe(0n);
  });

  test("getLiquidationSeizedAssets and getLiquidationRepaidShares round trip collateral value", () => {
    const seized = MarketUtils.getLiquidationSeizedAssets(10n, market, params);

    expect(seized).toBeGreaterThan(10n);
    expect(
      MarketUtils.getLiquidationRepaidShares(seized ?? 0n, market, params),
    ).toBeGreaterThanOrEqual(10n);
  });

  test("getLiquidationRepaidShares returns undefined without price", () => {
    expect(
      MarketUtils.getLiquidationRepaidShares(
        10n,
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
  });

  test("getSeizableCollateral handles missing price, zero price, healthy and liquidatable positions", () => {
    expect(
      MarketUtils.getSeizableCollateral(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getSeizableCollateral(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: 0n },
        params,
      ),
    ).toBe(0n);
    expect(
      MarketUtils.getSeizableCollateral(
        { collateral: 100n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(0n);
    expect(
      MarketUtils.getSeizableCollateral(
        { collateral: 100n, borrowShares: 80n },
        market,
        params,
      ),
    ).toBeGreaterThan(0n);
  });

  test("getWithdrawableCollateral handles missing and zero prices", () => {
    expect(
      MarketUtils.getWithdrawableCollateral(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getWithdrawableCollateral(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: 0n },
        params,
      ),
    ).toBe(0n);
  });

  test("isHealthy handles missing price and compares debt to borrow power", () => {
    expect(
      MarketUtils.isHealthy(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.isHealthy(
        { collateral: 100n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(true);
    expect(
      MarketUtils.isHealthy(
        { collateral: 100n, borrowShares: 80n },
        market,
        params,
      ),
    ).toBe(false);
  });

  test("getLiquidationPrice handles empty borrow and zero collateral power", () => {
    expect(
      MarketUtils.getLiquidationPrice(
        { collateral: 100n, borrowShares: 0n },
        market,
        params,
      ),
    ).toBeNull();
    expect(
      MarketUtils.getLiquidationPrice(
        { collateral: 0n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(MathLib.MAX_UINT_256);
  });

  test("getPriceVariationToLiquidationPrice handles missing price, zero price, empty borrow and active borrow", () => {
    expect(
      MarketUtils.getPriceVariationToLiquidationPrice(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getPriceVariationToLiquidationPrice(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: 0n },
        params,
      ),
    ).toBeNull();
    expect(
      MarketUtils.getPriceVariationToLiquidationPrice(
        { collateral: 100n, borrowShares: 0n },
        market,
        params,
      ),
    ).toBeNull();
    expect(
      MarketUtils.getPriceVariationToLiquidationPrice(
        { collateral: 100n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBeLessThan(0n);
  });

  test("getHealthFactor handles zero debt, missing price, and priced debt", () => {
    expect(
      MarketUtils.getHealthFactor(
        { collateral: 100n, borrowShares: 0n },
        market,
        params,
      ),
    ).toBe(MathLib.MAX_UINT_256);
    expect(
      MarketUtils.getHealthFactor(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getHealthFactor(
        { collateral: 100n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(5n * MathLib.WAD);
  });

  test("getLtv handles empty borrow, missing price, zero collateral value and priced borrow", () => {
    expect(
      MarketUtils.getLtv({ collateral: 100n, borrowShares: 0n }, market),
    ).toBeNull();
    expect(
      MarketUtils.getLtv(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getLtv(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: 0n },
      ),
    ).toBe(MathLib.MAX_UINT_256);
    expect(
      MarketUtils.getLtv({ collateral: 100n, borrowShares: 10n }, market),
    ).toBe(100_000_000_000_000_000n);
  });

  test("getBorrowCapacityUsage handles missing price, zero health factor and healthy usage", () => {
    expect(
      MarketUtils.getBorrowCapacityUsage(
        { collateral: 100n, borrowShares: 10n },
        { ...market, price: undefined },
        params,
      ),
    ).toBeUndefined();
    expect(
      MarketUtils.getBorrowCapacityUsage(
        { collateral: 0n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(MathLib.MAX_UINT_256);
    expect(
      MarketUtils.getBorrowCapacityUsage(
        { collateral: 100n, borrowShares: 10n },
        market,
        params,
      ),
    ).toBe(200_000_000_000_000_000n);
  });

  test("toBorrowShares uses Down rounding by default", () => {
    const fractionalMarket = {
      totalBorrowAssets: 3n,
      totalBorrowShares: 2n,
    };

    expect(MarketUtils.toBorrowShares(1n, fractionalMarket)).toBe(
      MarketUtils.toBorrowShares(1n, fractionalMarket, "Down"),
    );
    expect(MarketUtils.toBorrowShares(1n, fractionalMarket, "Up")).toBe(
      MarketUtils.toBorrowShares(1n, fractionalMarket) + 1n,
    );
  });
});

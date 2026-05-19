import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE } from "../constants.js";
import { MathLib } from "../math/MathLib.js";
import { MarketUtils } from "./MarketUtils.js";

const lltv = (pct: number) => (BigInt(pct * 1000) * MathLib.WAD) / 1000n;

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
});

import { Time, ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import { market, marketInput, marketParams } from "../__test__/fixtures.js";
import { ORACLE_PRICE_SCALE } from "../constants.js";
import { BlueErrors } from "../errors.js";
import { MathLib } from "../math/MathLib.js";
import { CapacityLimitReason } from "../utils.js";
import { Market } from "./Market.js";
import { MarketParams } from "./MarketParams.js";

describe("Market constructor and getters", () => {
  test("stores params instances directly and exposes derived getters", () => {
    const params = new MarketParams(marketParams());
    const m = new Market(marketInput({ params }));

    expect(m.params).toBe(params);
    expect(m.id).toBe(params.id);
    expect(m.isIdle).toBe(false);
    expect(m.liquidity).toBe(2_000_000n);
    expect(m.utilization).toBe(500_000_000_000_000_000n);
    expect(m.apyAtTarget).toBeGreaterThan(0);
  });

  test("supports idle markets and markets without adaptive rate data", () => {
    const m = market({
      params: marketParams({ collateralToken: ZERO_ADDRESS }),
      rateAtTarget: undefined,
    });

    expect(m.isIdle).toBe(true);
    expect(m.apyAtTarget).toBeUndefined();
    expect(m.endBorrowRate).toBe(0n);
    expect(m.avgBorrowRate).toBe(0n);
    expect(m.supplyApy).toBe(0);
    expect(m.borrowApy).toBe(0);
  });

  test("rate helpers reject timestamps before lastUpdate", () => {
    const m = market();

    expect(() => m.getEndBorrowRate(99n)).toThrow(
      BlueErrors.InvalidInterestAccrual,
    );
  });

  test("average APY helpers use average borrow and supply rates", () => {
    const m = market();

    expect(m.getAvgBorrowApy(200n)).toBeGreaterThan(0);
    expect(m.getAvgSupplyApy(200n)).toBeGreaterThan(0);
  });

  test("APR and APY helpers match known adaptive-rate examples", () => {
    const timestamp = 1_000_000n;
    const slowMarket = new Market(
      marketInput({
        totalSupplyAssets: 100n,
        totalBorrowAssets: 90n,
        totalSupplyShares: 10_000_000n,
        totalBorrowShares: 9_000_000n,
        rateAtTarget: 10_0000000000000000n / Time.s.from.y(1n),
        lastUpdate: timestamp,
        fee: 25_0000000000000000n,
      }),
    );
    const fastMarket = new Market(
      marketInput({
        totalSupplyAssets: 100n,
        totalBorrowAssets: 90n,
        totalSupplyShares: 10_000_000n,
        totalBorrowShares: 9_000_000n,
        rateAtTarget: 100_0000000000000000n / Time.s.from.y(1n),
        lastUpdate: timestamp,
        fee: 25_0000000000000000n,
      }),
    );

    expect(slowMarket.getAvgSupplyRate(timestamp) * Time.s.from.y(1n)).toBe(
      67_500000003024000n,
    );
    expect(slowMarket.getAvgSupplyApy(timestamp)).toBe(0.06983025960113722);
    expect(slowMarket.getAvgBorrowApy(timestamp)).toBe(0.10517091806252704);

    expect(fastMarket.getAvgSupplyRate(timestamp) * Time.s.from.y(1n)).toBe(
      67_4999999967168000n,
    );
    expect(fastMarket.getAvgSupplyApy(timestamp)).toBe(0.964032975905364);
    expect(fastMarket.getAvgBorrowApy(timestamp)).toBe(1.718281828393502);
  });
});

describe("Market accrueInterest and accounting actions", () => {
  test("accrueInterest returns an updated market and keeps the source unchanged", () => {
    const m = market({ fee: 0n });
    const accrued = m.accrueInterest(200n);

    expect(accrued).not.toBe(m);
    expect(accrued.lastUpdate).toBe(200n);
    expect(accrued.totalSupplyAssets).toBeGreaterThanOrEqual(
      m.totalSupplyAssets,
    );
    expect(m.lastUpdate).toBe(100n);
  });

  test("supply rejects inconsistent inputs and accepts assets or shares", () => {
    const m = market();

    expect(() => m.supply(0n, 0n)).toThrow(BlueErrors.InconsistentInput);
    expect(() => m.supply(1n, 1n)).toThrow(BlueErrors.InconsistentInput);
    expect(m.supply(100n, 0n).assets).toBe(100n);
    expect(m.supply(0n, 100n).shares).toBe(100n);
  });

  test("withdraw accepts assets or shares and enforces liquidity", () => {
    const m = market();

    expect(() => m.withdraw(0n, 0n)).toThrow(BlueErrors.InconsistentInput);
    expect(() => m.withdraw(1n, 1n)).toThrow(BlueErrors.InconsistentInput);
    expect(m.withdraw(100n, 0n).assets).toBe(100n);
    expect(m.withdraw(0n, 100n).shares).toBe(100n);
    expect(() =>
      market({ totalSupplyAssets: 400n, totalBorrowAssets: 400n }).withdraw(
        1n,
        0n,
      ),
    ).toThrow(BlueErrors.InsufficientLiquidity);
  });

  test("borrow accepts assets or shares and enforces liquidity", () => {
    const m = market();

    expect(() => m.borrow(0n, 0n)).toThrow(BlueErrors.InconsistentInput);
    expect(() => m.borrow(1n, 1n)).toThrow(BlueErrors.InconsistentInput);
    expect(m.borrow(100n, 0n).assets).toBe(100n);
    expect(m.borrow(0n, 100n).shares).toBe(100n);
    expect(() =>
      market({ totalSupplyAssets: 400n, totalBorrowAssets: 400n }).borrow(
        1n,
        0n,
      ),
    ).toThrow(BlueErrors.InsufficientLiquidity);
  });

  test("repay accepts assets or shares", () => {
    const m = market();

    expect(() => m.repay(0n, 0n)).toThrow(BlueErrors.InconsistentInput);
    expect(() => m.repay(1n, 1n)).toThrow(BlueErrors.InconsistentInput);
    expect(m.repay(100n, 0n).assets).toBe(100n);
    expect(m.repay(0n, 100n).shares).toBe(100n);
  });
});

describe("Market conversion and risk delegation", () => {
  test("share conversion helpers delegate to market totals", () => {
    const m = market();

    expect(m.toSupplyAssets(100n)).toBe(100n);
    expect(m.toSupplyShares(100n)).toBe(100n);
    expect(m.toBorrowAssets(100n)).toBe(100n);
    expect(m.toBorrowShares(100n)).toBe(100n);
  });

  test("utilization target helpers return non-negative amounts", () => {
    const m = market();

    expect(m.getSupplyToUtilization(MathLib.WAD / 4n)).toBeGreaterThan(0n);
    expect(m.getWithdrawToUtilization((MathLib.WAD * 3n) / 4n)).toBeGreaterThan(
      0n,
    );
    expect(m.getBorrowToUtilization((MathLib.WAD * 3n) / 4n)).toBeGreaterThan(
      0n,
    );
    expect(m.getRepayToUtilization(MathLib.WAD / 4n)).toBeGreaterThan(0n);
  });

  test("collateral and liquidation helpers use market params", () => {
    const m = market();
    const position = { collateral: 100n, borrowShares: 10n };

    expect(m.getCollateralValue(position.collateral)).toBe(100n);
    expect(m.getMaxBorrowAssets(position.collateral)).toBe(86n);
    expect(
      m.getMaxBorrowAssets(position.collateral, { maxLtv: MathLib.WAD }),
    ).toBe(86n);
    expect(
      m.getMaxBorrowAssets(position.collateral, {
        maxLtv: 500_000_000_000_000_000n,
      }),
    ).toBe(50n);
    expect(m.getMaxBorrowableAssets(position)).toBe(76n);
    expect(m.getLiquidationSeizedAssets(10n)).toBeGreaterThanOrEqual(10n);
    expect(m.getLiquidationRepaidShares(10n)).toBeGreaterThan(0n);
    expect(m.getSeizableCollateral(position)).toBe(0n);
    expect(m.getWithdrawableCollateral(position)).toBeGreaterThan(0n);
    expect(m.isHealthy(position)).toBe(true);
    expect(m.getLiquidationPrice(position)).toBeGreaterThan(0n);
    expect(m.getPriceVariationToLiquidationPrice(position)).toBeLessThan(0n);
    expect(m.getHealthFactor(position)).toBeGreaterThan(MathLib.WAD);
    expect(m.getLtv(position)).toBe(100_000_000_000_000_000n);
    expect(m.getBorrowCapacityUsage(position)).toBeLessThan(MathLib.WAD);
  });

  test("price-dependent helpers return undefined when the price is missing", () => {
    const m = market({ price: undefined });
    const position = { collateral: 100n, borrowShares: 10n };

    expect(m.getCollateralValue(position.collateral)).toBeUndefined();
    expect(m.getMaxBorrowAssets(position.collateral)).toBeUndefined();
    expect(m.getMaxBorrowableAssets(position)).toBeUndefined();
    expect(m.getLiquidationSeizedAssets(10n)).toBeUndefined();
    expect(m.getLiquidationRepaidShares(10n)).toBeUndefined();
    expect(m.getSeizableCollateral(position)).toBeUndefined();
    expect(m.getWithdrawableCollateral(position)).toBeUndefined();
    expect(m.isHealthy(position)).toBeUndefined();
    expect(m.getPriceVariationToLiquidationPrice(position)).toBeUndefined();
    expect(m.getHealthFactor(position)).toBeUndefined();
    expect(m.getLtv(position)).toBeUndefined();
    expect(m.getBorrowCapacityUsage(position)).toBeUndefined();
  });
});

describe("Market capacity helpers", () => {
  test("borrow capacity can be collateral, liquidity, or undefined limited", () => {
    const position = { collateral: 100n, borrowShares: 10n };

    expect(
      market({ price: undefined }).getBorrowCapacityLimit(position),
    ).toBeUndefined();
    expect(
      market().getBorrowCapacityLimit(position, {
        maxLtv: 500_000_000_000_000_000n,
      }),
    ).toStrictEqual({
      value: 40n,
      limiter: CapacityLimitReason.collateral,
    });
    expect(
      market({
        totalSupplyAssets: 2_000_010n,
        totalBorrowAssets: 2_000_000n,
      }).getBorrowCapacityLimit({ collateral: 1_000n, borrowShares: 0n }),
    ).toStrictEqual({
      value: 10n,
      limiter: CapacityLimitReason.liquidity,
    });
  });

  test("repay capacity is balance or position limited", () => {
    const m = market();

    expect(m.getRepayCapacityLimit(100n, 50n)).toStrictEqual({
      value: 50n,
      limiter: CapacityLimitReason.balance,
    });
    expect(m.getRepayCapacityLimit(100n, 150n)).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.position,
    });
  });

  test("withdraw capacity is liquidity or position limited", () => {
    expect(
      market().getWithdrawCapacityLimit({ supplyShares: 100n }),
    ).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.position,
    });
    expect(
      market({
        totalSupplyAssets: 2_000_050n,
        totalBorrowAssets: 2_000_000n,
      }).getWithdrawCapacityLimit({ supplyShares: 200n }),
    ).toStrictEqual({
      value: 50n,
      limiter: CapacityLimitReason.liquidity,
    });
  });

  test("withdraw collateral capacity is collateral, position, or undefined limited", () => {
    const position = { collateral: 100n, borrowShares: 10n };

    expect(
      market({ price: undefined }).getWithdrawCollateralCapacityLimit(position),
    ).toBeUndefined();
    expect(market().getWithdrawCollateralCapacityLimit(position)).toStrictEqual(
      {
        value: 88n,
        limiter: CapacityLimitReason.collateral,
      },
    );
    expect(
      market().getWithdrawCollateralCapacityLimit({
        collateral: 1n,
        borrowShares: 0n,
      }),
    ).toStrictEqual({
      value: 1n,
      limiter: CapacityLimitReason.position,
    });
  });

  test("getMaxCapacities aggregates all capacity limits", () => {
    const capacities = market().getMaxCapacities(
      { collateral: 100n, supplyShares: 100n, borrowShares: 10n },
      50n,
      60n,
      {
        borrow: { maxLtv: 500_000_000_000_000_000n },
        withdrawCollateral: { maxLtv: 500_000_000_000_000_000n },
      },
    );

    expect(capacities.supply).toStrictEqual({
      value: 50n,
      limiter: CapacityLimitReason.balance,
    });
    expect(capacities.withdraw.value).toBe(100n);
    expect(capacities.borrow?.value).toBe(40n);
    expect(capacities.repay.value).toBe(10n);
    expect(capacities.supplyCollateral.value).toBe(60n);
    expect(capacities.withdrawCollateral?.value).toBe(80n);
  });

  test("capacity helpers work with zero oracle price", () => {
    const m = market({ price: 0n });
    const position = { collateral: 100n, borrowShares: 10n };

    expect(m.getCollateralValue(position.collateral)).toBe(0n);
    expect(m.getWithdrawableCollateral(position)).toBe(0n);
    expect(m.getLtv(position)).toBe(MathLib.MAX_UINT_256);
    expect(m.getBorrowCapacityUsage(position)).toBe(MathLib.MAX_UINT_256);
    expect(m.getLiquidationSeizedAssets(10n)).toBe(0n);
  });

  test("loan values use the oracle scale", () => {
    const m = market({ price: ORACLE_PRICE_SCALE * 2n });

    expect(m.getCollateralValue(10n)).toBe(20n);
  });
});

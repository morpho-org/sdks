import { describe, expect, test } from "vitest";
import {
  accrualPosition,
  market,
  positionInput,
  USER,
} from "../__test__/fixtures.js";
import { BlueErrors } from "../errors.js";
import { MathLib } from "../math/MathLib.js";
import { CapacityLimitReason } from "../utils.js";
import { AccrualPosition, Position } from "./Position.js";

describe("Position", () => {
  test("constructor stores position fields", () => {
    const input = positionInput();
    const position = new Position(input);

    expect(position.user).toBe(USER);
    expect(position.marketId).toBe(input.marketId);
    expect(position.supplyShares).toBe(100n);
    expect(position.borrowShares).toBe(50n);
    expect(position.collateral).toBe(200n);
  });
});

describe("AccrualPosition getters", () => {
  test("exposes market-derived accounting and risk values", () => {
    const position = accrualPosition();

    expect(position.market).toStrictEqual(market());
    expect(position.supplyAssets).toBe(100n);
    expect(position.borrowAssets).toBe(50n);
    expect(position.collateralValue).toBe(200n);
    expect(position.maxBorrowAssets).toBe(172n);
    expect(position.maxBorrowableAssets).toBe(122n);
    expect(position.seizableCollateral).toBe(0n);
    expect(position.withdrawableCollateral).toBe(141n);
    expect(position.isHealthy).toBe(true);
    expect(position.isLiquidatable).toBe(false);
    expect(position.liquidationPrice).toBeGreaterThan(0n);
    expect(position.priceVariationToLiquidationPrice).toBeLessThan(0n);
    expect(position.ltv).toBe(250_000_000_000_000_000n);
    expect(position.healthFactor).toBeGreaterThan(MathLib.WAD);
    expect(position.borrowCapacityUsage).toBeLessThan(MathLib.WAD);
    expect(position.withdrawCapacityLimit).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.position,
    });
  });

  test("price-dependent getters return undefined when price is missing", () => {
    const position = accrualPosition({}, { price: undefined });

    expect(position.collateralValue).toBeUndefined();
    expect(position.maxBorrowAssets).toBeUndefined();
    expect(position.maxBorrowableAssets).toBeUndefined();
    expect(position.seizableCollateral).toBeUndefined();
    expect(position.withdrawableCollateral).toBeUndefined();
    expect(position.isHealthy).toBeUndefined();
    expect(position.isLiquidatable).toBeUndefined();
    expect(position.priceVariationToLiquidationPrice).toBeUndefined();
    expect(position.ltv).toBeUndefined();
    expect(position.healthFactor).toBeUndefined();
    expect(position.borrowCapacityUsage).toBeUndefined();
  });

  test("liquidatable positions invert isHealthy", () => {
    const position = accrualPosition({ borrowShares: 200n });

    expect(position.isHealthy).toBe(false);
    expect(position.isLiquidatable).toBe(true);
    expect(position.seizableCollateral).toBeGreaterThan(0n);
  });
});

describe("AccrualPosition state transitions", () => {
  test("accrueInterest returns a new AccrualPosition", () => {
    const position = accrualPosition();
    const accrued = position.accrueInterest(200n);

    expect(accrued).toBeInstanceOf(AccrualPosition);
    expect(accrued).not.toBe(position);
    expect(accrued.market.lastUpdate).toBe(200n);
  });

  test("supply increases supply shares", () => {
    const position = accrualPosition();
    const result = position.supply(100n, 0n);

    expect(result.position.supplyShares).toBe(200n);
    expect(result.assets).toBe(100n);
    expect(result.shares).toBe(100n);
  });

  test("withdraw decreases supply shares and rejects over-withdraw", () => {
    const position = accrualPosition();

    expect(position.withdraw(50n, 0n).position.supplyShares).toBe(50n);
    expect(() => position.withdraw(0n, 101n)).toThrow(
      BlueErrors.InsufficientPosition,
    );
  });

  test("supplyCollateral increases collateral and returns a fresh position", () => {
    const position = accrualPosition();
    const result = position.supplyCollateral(10n);

    expect(position.collateral).toBe(210n);
    expect(result).not.toBe(position);
    expect(result.collateral).toBe(210n);
  });

  test("withdrawCollateral validates price, position balance, and health", () => {
    expect(() =>
      accrualPosition({}, { price: undefined }).withdrawCollateral(1n),
    ).toThrow(BlueErrors.UnknownOraclePrice);
    expect(() => accrualPosition().withdrawCollateral(201n)).toThrow(
      BlueErrors.InsufficientPosition,
    );
    expect(() => accrualPosition().withdrawCollateral(190n)).toThrow(
      BlueErrors.InsufficientCollateral,
    );
    expect(accrualPosition().withdrawCollateral(1n).collateral).toBe(199n);
  });

  test("borrow validates price and collateral before increasing borrow shares", () => {
    expect(() =>
      accrualPosition({}, { price: undefined }).borrow(1n, 0n),
    ).toThrow(BlueErrors.UnknownOraclePrice);
    expect(() => accrualPosition().borrow(1_000n, 0n)).toThrow(
      BlueErrors.InsufficientCollateral,
    );

    const result = accrualPosition().borrow(10n, 0n);
    expect(result.position.borrowShares).toBe(60n);
    expect(result.assets).toBe(10n);
  });

  test("repay decreases borrow shares and rejects over-repay", () => {
    const position = accrualPosition();

    expect(position.repay(10n, 0n).position.borrowShares).toBe(40n);
    expect(() => position.repay(0n, 51n)).toThrow(
      BlueErrors.InsufficientPosition,
    );
  });
});

describe("AccrualPosition capacity helpers", () => {
  test("delegates individual capacity helpers to the market", () => {
    const position = accrualPosition();

    expect(
      position.getBorrowCapacityLimit({ maxLtv: MathLib.WAD })?.value,
    ).toBe(122n);
    expect(
      position.getWithdrawCollateralCapacityLimit({ maxLtv: MathLib.WAD })
        ?.value,
    ).toBe(141n);
    expect(position.getRepayCapacityLimit(25n)).toStrictEqual({
      value: 25n,
      limiter: CapacityLimitReason.balance,
    });
  });

  test("getMaxCapacities aggregates all position capacity limits", () => {
    const capacities = accrualPosition().getMaxCapacities(25n, 30n, {
      borrow: { maxLtv: MathLib.WAD },
      withdrawCollateral: { maxLtv: MathLib.WAD },
    });

    expect(capacities.supply).toStrictEqual({
      value: 25n,
      limiter: CapacityLimitReason.balance,
    });
    expect(capacities.withdraw.value).toBe(100n);
    expect(capacities.borrow?.value).toBe(122n);
    expect(capacities.repay.value).toBe(25n);
    expect(capacities.supplyCollateral.value).toBe(30n);
    expect(capacities.withdrawCollateral?.value).toBe(141n);
  });
});

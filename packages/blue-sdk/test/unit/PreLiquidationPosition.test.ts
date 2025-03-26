import { parseEther, parseUnits } from "viem";
import { describe, expect, test } from "vitest";
import {
  CapacityLimitReason,
  ChainId,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
  PreLiquidationPosition,
  addresses,
} from "../../src/index.js";
import { PreLiquidationParams } from "../../src/position/index.js";

const { usdc, wstEth, adaptiveCurveIrm } = addresses[ChainId.EthMainnet]!;

const params = new MarketParams({
  // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
  loanToken: usdc!,
  collateralToken: wstEth!,
  oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
  irm: adaptiveCurveIrm!,
  lltv: parseUnits("86", 16),
});

const market = new Market({
  params,
  totalSupplyAssets: 2000000000000n,
  totalBorrowAssets: 1000000000000n,
  totalSupplyShares: 2000000000000000000n,
  totalBorrowShares: 1000000000000000000n,
  lastUpdate: 1000000n,
  fee: 0n,
  price: ORACLE_PRICE_SCALE,
  rateAtTarget: 1672790194n,
});

const preLiquidationParams = new PreLiquidationParams({
  preLltv: 800000000000000000n,
  preLCF1: 200000000000000000n,
  preLCF2: 800000000000000000n,
  preLIF1: 1010000000000000000n,
  preLIF2: 1010000000000000000n,
  preLiquidationOracle: market.params.oracle,
});

const preLiquidationAddress = "0x0000000000000000000000000000000000000001";
const user = "0x0000000000000000000000000000000000000002";

const position = new PreLiquidationPosition(
  {
    preLiquidationParams,
    preLiquidation: preLiquidationAddress,
    preLiquidationOraclePrice: market.price,
    user,
    supplyShares: 0n,
    borrowShares: 100000000000000000n,
    collateral: 200000000000n,
  },
  market,
);

describe("preLiquidationPosition", () => {
  test("should be undefined if the price is undefined", () => {
    const preLiquidationPosition = new PreLiquidationPosition(
      { ...position, preLiquidationOraclePrice: undefined },
      market,
    );

    expect(preLiquidationPosition.ltv).toBe(undefined);
    expect(preLiquidationPosition.isHealthy).toBe(undefined);
    expect(preLiquidationPosition.priceVariationToLiquidationPrice).toBe(
      undefined,
    );
    expect(preLiquidationPosition.maxBorrowAssets).toBe(undefined);
    expect(preLiquidationPosition.withdrawableCollateral).toBe(undefined);
    expect(preLiquidationPosition.seizableCollateral).toBe(undefined);
    expect(preLiquidationPosition.healthFactor).toBe(undefined);
    expect(preLiquidationPosition.borrowCapacityUsage).toBe(undefined);
    expect(preLiquidationPosition.borrowCapacityUsage).toBe(undefined);
    expect(preLiquidationPosition.getBorrowCapacityLimit()).toBe(undefined);
    expect(preLiquidationPosition.getWithdrawCollateralCapacityLimit()).toBe(
      undefined,
    );
    expect(preLiquidationPosition.borrowCapacityUsage).toBe(undefined);
    expect(preLiquidationPosition.getBorrowCapacityLimit()).toBe(undefined);
    expect(preLiquidationPosition.getWithdrawCollateralCapacityLimit()).toBe(
      undefined,
    );
  });

  test("should not be pre-liquidatable because the position has no borrow", () => {
    const preLiquidationPosition = new PreLiquidationPosition(
      { ...position, borrowShares: 0n },
      market,
    );

    expect(preLiquidationPosition.isHealthy).toBe(true);
    expect(preLiquidationPosition.healthFactor).toEqual(MathLib.MAX_UINT_256);
    expect(preLiquidationPosition.liquidationPrice).toBe(null);
  });

  test("should not be pre-liquidatable because the position may be liquidatable", () => {
    const preLiquidationPosition = new PreLiquidationPosition(
      { ...position, collateral: 100000000000n },
      market,
    );

    expect(preLiquidationPosition.isHealthy).toBe(undefined);
    expect(preLiquidationPosition.seizableCollateral).toBe(0n);
  });

  test("should not be pre-liquidatable because the position is healthy", () => {
    const preLiquidationPosition = new PreLiquidationPosition(
      { ...position, borrowShares: 50000000000000000n },
      market,
    );
    const borrowCapacityLimit = preLiquidationPosition.getBorrowCapacityLimit();
    const withdrawCollateralCapacityLimit =
      preLiquidationPosition.getWithdrawCollateralCapacityLimit();

    expect(preLiquidationPosition.isHealthy).toBe(true);
    expect(preLiquidationPosition.seizableCollateral).toBe(0n);
    expect(preLiquidationPosition.healthFactor).toEqual(3200000000000000000n);
    expect(preLiquidationPosition.liquidationPrice).toEqual(
      312500000000000000000000000000000000n,
    );
    expect(preLiquidationPosition.borrowCapacityUsage).toEqual(
      312500000000000000n,
    );

    expect(borrowCapacityLimit?.limiter).toEqual("Collateral");
    expect(borrowCapacityLimit?.value).toEqual(110000000000n);
    expect(withdrawCollateralCapacityLimit?.limiter).toEqual("Collateral");
    expect(withdrawCollateralCapacityLimit?.value).toEqual(137500000000n);
  });

  test("should be pre-liquidatable", () => {
    const preLiquidationPosition = new PreLiquidationPosition(
      { ...position, borrowShares: 170000000000000000n },
      market,
    );

    const borrowCapacityLimit = preLiquidationPosition.getBorrowCapacityLimit();
    const withdrawCollateralCapacityLimit =
      preLiquidationPosition.getWithdrawCollateralCapacityLimit();

    expect(preLiquidationPosition.isHealthy).toBe(false);
    expect(preLiquidationPosition.seizableCollateral).toEqual(120189999998n);
    expect(preLiquidationPosition.healthFactor).toBeLessThan(parseEther("1"));
    expect(preLiquidationPosition.borrowCapacityUsage).toBeGreaterThan(
      parseEther("1"),
    );

    expect(borrowCapacityLimit?.limiter).toEqual(
      CapacityLimitReason.collateral,
    );
    expect(borrowCapacityLimit?.value).toEqual(0n);
    expect(withdrawCollateralCapacityLimit?.limiter).toEqual(
      CapacityLimitReason.collateral,
    );
    expect(withdrawCollateralCapacityLimit?.value).toEqual(0n);
  });
});

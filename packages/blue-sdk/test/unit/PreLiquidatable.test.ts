import { parseEther, parseUnits } from "viem";
import { describe, expect, test } from "vitest";
import {
  ChainId,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
  PreLiquidatablePosition,
  addresses,
} from "../../src/index.js";

const { usdc, wstEth, adaptiveCurveIrm } = addresses[ChainId.EthMainnet];

const params = new MarketParams({
  // USDC(wstETH, 86%, Chainlink, AdaptiveCurve)
  loanToken: usdc,
  collateralToken: wstEth,
  oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
  irm: adaptiveCurveIrm,
  lltv: parseUnits("86", 16),
});

const market = {
  params,
  totalSupplyAssets: 2000000000000n,
  totalBorrowAssets: 1000000000000n,
  totalSupplyShares: 2000000000000000000n,
  totalBorrowShares: 1000000000000000000n,
  lastUpdate: 1000000n,
  fee: 0n,
  price: ORACLE_PRICE_SCALE,
  rateAtTarget: 1672790194n,
};

const preLiquidationParams = {
  preLltv: 800000000000000000n,
  preLCF1: 200000000000000000n,
  preLCF2: 800000000000000000n,
  preLIF1: 1010000000000000000n,
  preLIF2: 1010000000000000000n,
  preLiquidationOracle: market.params.oracle,
};

const preLiquidationAddress =
  "0x0000000000000000000000000000000000000001" as `0x${string}`;
const user = "0x0000000000000000000000000000000000000002" as `0x${string}`;

const position = {
  preLiquidationParams,
  preLiquidation: preLiquidationAddress,
  isPreLiquidationAuthorized: true,
  user,
  supplyShares: 0n,
  borrowShares: 100000000000000000n,
  collateral: 200000000000n,
};

describe("PreLiquidatablePosition", () => {
  test("should be undefined if the price is undefined", () => {
    const preLiquidatablePosition = new PreLiquidatablePosition(
      position,
      new Market({ ...market, price: undefined }),
    );

    expect(preLiquidatablePosition.isPreLiquidatable).toBe(undefined);
    expect(preLiquidatablePosition.isLiquidatable).toBe(undefined);
    expect(preLiquidatablePosition.ltv).toBe(undefined);
    expect(preLiquidatablePosition.isHealthy).toBe(undefined);
    expect(preLiquidatablePosition.priceVariationToLiquidationPrice).toBe(
      undefined,
    );
    expect(preLiquidatablePosition.maxBorrowAssets).toBe(undefined);
    expect(preLiquidatablePosition.withdrawableCollateral).toBe(undefined);
    expect(preLiquidatablePosition.preSeizableCollateral).toBe(undefined);
    expect(preLiquidatablePosition.preHealthFactor).toBe(undefined);
    expect(preLiquidatablePosition.borrowCapacityUsage).toBe(undefined);
  });

  test("should not be preLiquidatable because pre liquidation is not authorized", () => {
    const preLiquidatablePosition = new PreLiquidatablePosition(
      { ...position, isPreLiquidationAuthorized: false },
      new Market(market),
    );

    expect(preLiquidatablePosition.isPreLiquidatable).toBe(false);
    expect(preLiquidatablePosition.isHealthy).toBe(true);
  });

  test("should not be preLiquidatable because the position has no borrow", () => {
    const preLiquidatablePosition = new PreLiquidatablePosition(
      { ...position, borrowShares: 0n },
      new Market(market),
    );

    expect(preLiquidatablePosition.isPreLiquidatable).toBe(false);
    expect(preLiquidatablePosition.isHealthy).toBe(true);
    expect(preLiquidatablePosition.preHealthFactor).toEqual(
      MathLib.MAX_UINT_256,
    );
    expect(preLiquidatablePosition.preLiquidationPrice).toBe(null);
  });

  test("should not be preLiquidatable because the position is liquidatable", () => {
    const preLiquidatablePosition = new PreLiquidatablePosition(
      { ...position, collateral: 100000000000n },
      new Market(market),
    );

    expect(preLiquidatablePosition.isLiquidatable).toBe(true);
    expect(preLiquidatablePosition.isHealthy).toBe(false);
    expect(preLiquidatablePosition.isPreLiquidatable).toBe(false);
    expect(preLiquidatablePosition.preSeizableCollateral).toBe(0n);
  });

  test("should not be preLiquidatable because the position is healthy", () => {
    const preLiquidatablePosition = new PreLiquidatablePosition(
      { ...position, borrowShares: 50000000000000000n },
      new Market(market),
    );

    expect(preLiquidatablePosition.isHealthy).toBe(true);
    expect(preLiquidatablePosition.isPreLiquidatable).toBe(false);
    expect(preLiquidatablePosition.preSeizableCollateral).toBe(0n);
    expect(preLiquidatablePosition.preHealthFactor).toEqual(
      3200000000000000000n,
    );
    expect(preLiquidatablePosition.preLiquidationPrice).toEqual(
      290697674418604651162790697674418605n,
    );
  });

  test("should be preLiquidatable", () => {
    const preLiquidatablePosition = new PreLiquidatablePosition(
      { ...position, borrowShares: 170000000000000000n },
      new Market(market),
    );

    expect(preLiquidatablePosition.isHealthy).toBe(false);
    expect(preLiquidatablePosition.isPreLiquidatable).toBe(true);
    expect(preLiquidatablePosition.preSeizableCollateral).toEqual(
      120189999998n,
    );
    expect(preLiquidatablePosition.preHealthFactor).toBeLessThan(
      parseEther("1"),
    );
  });
});

import { parseEther, parseUnits } from "viem";
import { describe, expect, test } from "vitest";
import { market, ORACLE, RECIPIENT, USER } from "../__test__/fixtures.js";
import { addresses } from "../addresses.js";
import { ChainId } from "../chain.js";
import { ORACLE_PRICE_SCALE } from "../constants.js";
import { Market } from "../market/Market.js";
import { MarketParams } from "../market/MarketParams.js";
import { MathLib } from "../math/MathLib.js";
import { CapacityLimitReason } from "../utils.js";
import {
  PreLiquidationParams,
  PreLiquidationPosition,
} from "./PreLiquidationPosition.js";

const preLiquidationParams = new PreLiquidationParams({
  preLltv: 800_000_000_000_000_000n,
  preLCF1: 200_000_000_000_000_000n,
  preLCF2: 800_000_000_000_000_000n,
  preLIF1: 1_010_000_000_000_000_000n,
  preLIF2: 1_050_000_000_000_000_000n,
  preLiquidationOracle: ORACLE,
});

function preLiquidationPosition(
  options: {
    borrowShares?: bigint;
    collateral?: bigint;
    totalBorrowAssets?: bigint;
    preLiquidationOraclePrice?: bigint;
    totalBorrowShares?: bigint;
  } = {},
) {
  const {
    borrowShares = 83n,
    collateral = 100n,
    totalBorrowAssets,
    totalBorrowShares,
  } = options;
  const preLiquidationOraclePrice =
    "preLiquidationOraclePrice" in options
      ? options.preLiquidationOraclePrice
      : market().price;
  const baseMarket = market({
    ...(totalBorrowAssets == null ? {} : { totalBorrowAssets }),
    ...(totalBorrowShares == null ? {} : { totalBorrowShares }),
  });

  return new PreLiquidationPosition(
    {
      user: USER,
      supplyShares: 0n,
      borrowShares,
      collateral,
      preLiquidationParams,
      preLiquidation: RECIPIENT,
      preLiquidationOraclePrice,
    },
    baseMarket,
  );
}

const mainnetAddresses = addresses[ChainId.EthMainnet]!;
const mainnetMarketParams = new MarketParams({
  loanToken: mainnetAddresses.usdc!,
  collateralToken: mainnetAddresses.wstEth!,
  oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
  irm: mainnetAddresses.adaptiveCurveIrm!,
  lltv: parseUnits("86", 16),
});
const mainnetMarket = new Market({
  params: mainnetMarketParams,
  totalSupplyAssets: 2_000_000_000_000n,
  totalBorrowAssets: 1_000_000_000_000n,
  totalSupplyShares: 2_000_000_000_000_000_000n,
  totalBorrowShares: 1_000_000_000_000_000_000n,
  lastUpdate: 1_000_000n,
  fee: 0n,
  price: ORACLE_PRICE_SCALE,
  rateAtTarget: 1_672_790_194n,
});
const mainnetPreLiquidationParams = new PreLiquidationParams({
  preLltv: 800_000_000_000_000_000n,
  preLCF1: 200_000_000_000_000_000n,
  preLCF2: 800_000_000_000_000_000n,
  preLIF1: 1_010_000_000_000_000_000n,
  preLIF2: 1_010_000_000_000_000_000n,
  preLiquidationOracle: mainnetMarket.params.oracle,
});
const mainnetPositionInput = {
  preLiquidationParams: mainnetPreLiquidationParams,
  preLiquidation: RECIPIENT,
  preLiquidationOraclePrice: mainnetMarket.price,
  user: USER,
  supplyShares: 0n,
  borrowShares: 100_000_000_000_000_000n,
  collateral: 200_000_000_000n,
};

describe("PreLiquidationParams", () => {
  test("constructor normalizes BigIntish fields", () => {
    const params = new PreLiquidationParams({
      preLltv: "1",
      preLCF1: 2,
      preLCF2: 3n,
      preLIF1: true,
      preLIF2: 5n,
      preLiquidationOracle: ORACLE,
    });

    expect(params.preLltv).toBe(1n);
    expect(params.preLCF1).toBe(2n);
    expect(params.preLCF2).toBe(3n);
    expect(params.preLIF1).toBe(1n);
    expect(params.preLIF2).toBe(5n);
    expect(params.preLiquidationOracle).toBe(ORACLE);
  });

  test("close factor and incentive factor interpolate by quotient", () => {
    expect(preLiquidationParams.getCloseFactor(0n)).toBe(
      preLiquidationParams.preLCF1,
    );
    expect(preLiquidationParams.getCloseFactor(MathLib.WAD)).toBe(
      preLiquidationParams.preLCF2,
    );
    expect(preLiquidationParams.getIncentiveFactor(0n)).toBe(
      preLiquidationParams.preLIF1,
    );
    expect(preLiquidationParams.getIncentiveFactor(MathLib.WAD)).toBe(
      preLiquidationParams.preLIF2,
    );
  });
});

describe("PreLiquidationPosition", () => {
  test("constructor preserves pre-liquidation metadata and exposes the base market", () => {
    const position = preLiquidationPosition();

    expect(position.preLiquidationParams).toStrictEqual(preLiquidationParams);
    expect(position.preLiquidation).toBe(RECIPIENT);
    expect(position.preLiquidationOraclePrice).toBe(market().price);
    expect(position.market.params.lltv).toBe(market().params.lltv);
  });

  test("price-dependent states are undefined when the pre-liquidation oracle price is missing", () => {
    const position = preLiquidationPosition({
      preLiquidationOraclePrice: undefined,
    });

    expect(position.preLiquidationOraclePrice).toBeUndefined();
    expect(position.isHealthy).toBeUndefined();
    expect(position.isLiquidatable).toBeUndefined();
    expect(position.seizableCollateral).toBeUndefined();
  });

  test("healthy positions are not pre-liquidatable", () => {
    const position = preLiquidationPosition({ borrowShares: 50n });

    expect(position.isHealthy).toBe(true);
    expect(position.isLiquidatable).toBe(false);
    expect(position.seizableCollateral).toBe(0n);
  });

  test("positions liquidatable on the base market return undefined health and zero pre-liquidation seizure", () => {
    const position = preLiquidationPosition({ borrowShares: 90n });

    expect(position.isHealthy).toBeUndefined();
    expect(position.isLiquidatable).toBe(false);
    expect(position.seizableCollateral).toBe(0n);
  });

  test("pre-liquidatable positions expose seizable collateral", () => {
    const position = preLiquidationPosition({ borrowShares: 83n });

    expect(position.isHealthy).toBe(false);
    expect(position.isLiquidatable).toBe(true);
    expect(position.seizableCollateral).toBeGreaterThan(0n);
  });

  test("mainnet no-borrow positions stay healthy with infinite health factor", () => {
    const position = new PreLiquidationPosition(
      { ...mainnetPositionInput, borrowShares: 0n },
      mainnetMarket,
    );

    expect(position.isHealthy).toBe(true);
    expect(position.healthFactor).toBe(MathLib.MAX_UINT_256);
    expect(position.liquidationPrice).toBeNull();
  });

  test("mainnet pre-liquidatable positions expose exact limits", () => {
    const position = new PreLiquidationPosition(
      { ...mainnetPositionInput, borrowShares: 170_000_000_000_000_000n },
      mainnetMarket,
    );
    const borrowCapacityLimit = position.getBorrowCapacityLimit();
    const withdrawCollateralCapacityLimit =
      position.getWithdrawCollateralCapacityLimit();

    expect(position.isHealthy).toBe(false);
    expect(position.seizableCollateral).toBe(120_189_999_998n);
    expect(position.healthFactor).toBeLessThan(parseEther("1"));
    expect(position.borrowCapacityUsage).toBeGreaterThan(parseEther("1"));
    expect(borrowCapacityLimit).toStrictEqual({
      limiter: CapacityLimitReason.collateral,
      value: 0n,
    });
    expect(withdrawCollateralCapacityLimit).toStrictEqual({
      limiter: CapacityLimitReason.collateral,
      value: 0n,
    });
  });

  test("seizable collateral is undefined when ltv is unavailable", () => {
    const position = preLiquidationPosition({
      borrowShares: 1n,
      collateral: 250n,
      totalBorrowAssets: 204_000_000n,
      totalBorrowShares: 0n,
    });

    expect(position.isLiquidatable).toBe(true);
    expect(position.ltv).toBe(null);
    expect(position.seizableCollateral).toBeUndefined();
  });

  test("accrueInterest preserves pre-liquidation semantics", () => {
    const position = preLiquidationPosition();
    const accrued = position.accrueInterest(200n);

    expect(accrued).toBeInstanceOf(PreLiquidationPosition);
    expect(accrued.preLiquidationParams).toStrictEqual(preLiquidationParams);
    expect(accrued.preLiquidation).toBe(RECIPIENT);
    expect(accrued.preLiquidationOraclePrice).toBe(
      position.preLiquidationOraclePrice,
    );
    expect(accrued.market.lastUpdate).toBe(200n);
  });
});

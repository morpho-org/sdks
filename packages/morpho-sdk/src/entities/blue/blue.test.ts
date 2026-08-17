import {
  AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, createPublicClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  computeMaxRepaySharePrice,
  computeMaxSupplySharePrice,
} from "../../helpers/index.js";

const MARKET_PARAMS = new MarketParams(CbbtcUsdcBlue);
const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RATE_AT_TARGET = 3_170_979_198n;
const NOW_SEC = 1_800_000_000n;

function makeStalePosition(supplyShares = 0n) {
  const market = new Market({
    params: MARKET_PARAMS,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: NOW_SEC - 5n * 24n * 3_600n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
    rateAtTarget: RATE_AT_TARGET,
  });

  return new AccrualPosition(
    {
      user: USER,
      supplyShares,
      borrowShares: 10n ** 18n,
      collateral: 10n ** 24n,
    },
    market,
  );
}

describe("MorphoBlue repay maxSharePrice forward-accrual (VAU-1206)", () => {
  const TWO_HOURS = 7_200n;

  const localClient = createPublicClient({ chain: mainnet, transport: http() });

  test("repay assets mode derives maxSharePrice from the forward-accrued market", () => {
    const positionData = makeStalePosition();
    const market = localClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const amount = parseUnits("1000", 6);

    const tx = withChainTimestamp(NOW_SEC, () =>
      market.repay({ amount, userAddress: USER, positionData }).buildTx(),
    );

    const accruedMarket = positionData.market.accrueInterest(
      NOW_SEC + TWO_HOURS,
    );
    const expected = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: accruedMarket,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const stale = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    expect(tx.action.args.maxSharePrice).toBe(expected);
    expect(tx.action.args.maxSharePrice).toBeGreaterThan(stale);
  });

  test("repayWithdrawCollateral assets mode derives maxSharePrice from the forward-accrued market", () => {
    const positionData = makeStalePosition();
    const market = localClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const amount = parseUnits("1000", 6);

    const tx = withChainTimestamp(NOW_SEC, () =>
      market
        .repayWithdrawCollateral({
          amount,
          withdrawAmount: 1n,
          userAddress: USER,
          positionData,
        })
        .buildTx(),
    );

    const accruedMarket = positionData.market.accrueInterest(
      NOW_SEC + TWO_HOURS,
    );
    const expected = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: accruedMarket,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const stale = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    expect(tx.action.args.maxSharePrice).toBe(expected);
    expect(tx.action.args.maxSharePrice).toBeGreaterThan(stale);
  });
});

describe("MorphoBlue requirements", () => {
  test("withdraw omits authorization when already authorized", async () => {
    const handle = createMockClient(mainnet);
    const { morpho } = getChainAddresses(mainnet.id);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    await expect(
      market
        .withdraw({
          assets: 1n,
          userAddress: USER,
          positionData: makeStalePosition(10n ** 18n),
        })
        .getRequirements(),
    ).resolves.toEqual([]);
  });
});

describe("MorphoBlue supply maxSharePrice forward-accrual", () => {
  const RAY = MathLib.RAY;
  const rDivDown = (a: bigint, b: bigint) => (a * RAY) / b;

  function staleMarket() {
    return new Market({
      params: new MarketParams(WstethWethBlue),
      totalSupplyAssets: 10n ** 24n,
      totalBorrowAssets: (10n ** 24n * 9n) / 10n,
      totalSupplyShares: 10n ** 30n,
      totalBorrowShares: (10n ** 30n * 9n) / 10n,
      lastUpdate: NOW_SEC - 5n * 24n * 3_600n,
      fee: 0n,
      price: ORACLE_PRICE_SCALE,
      rateAtTarget: RATE_AT_TARGET,
    });
  }

  const localClient = createPublicClient({ chain: mainnet, transport: http() });

  test("native-only supply derives maxSharePrice from the forward-accrued market", () => {
    const marketData = staleMarket();
    const nativeAmount = parseUnits("10", 18);
    const market = localClient
      .extend(morphoViemExtension())
      .morpho.blue(WstethWethBlue, mainnet.id);

    const tx = withChainTimestamp(NOW_SEC, () =>
      market.supply({ nativeAmount, userAddress: USER, marketData }).buildTx(),
    );

    const accruedMarket = marketData.accrueInterest(
      MathLib.max(NOW_SEC, marketData.lastUpdate) + Time.s.from.h(2n),
    );
    const expected = computeMaxSupplySharePrice({
      supplyAssets: nativeAmount,
      market: accruedMarket,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const stale = computeMaxSupplySharePrice({
      supplyAssets: nativeAmount,
      market: marketData,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    expect(tx.action.args.maxSharePrice).toBe(expected);
    expect(tx.action.args.maxSharePrice).toBeGreaterThan(stale);

    const onchainSharePrice = rDivDown(
      nativeAmount,
      accruedMarket.toSupplyShares(nativeAmount, "Down"),
    );
    expect(tx.action.args.maxSharePrice).toBeGreaterThanOrEqual(
      onchainSharePrice,
    );
    expect(onchainSharePrice).toBeGreaterThan(stale);
  });
});

import { MarketUtils } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkBlueOperation } from "./blue.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const AUTH: Address = getAddress("0x00000000000000000000000000000000000000aa");

const ctx = makeCheckContext();

type Op = Parameters<typeof checkBlueOperation>[1];
const mkOp = (op: object) => op as Op;
const balance = (token: Address, assets: bigint) => ({
  account: TEST_OWNER,
  token,
  before: 0n,
  after: assets,
  assets,
});

describe("checkBlueOperation", () => {
  test("blueAuthorization returns the observed flag", () => {
    const op = mkOp({
      type: "blueAuthorization",
      authorized: AUTH,
      expectedIsAuthorized: true,
    });
    const state = makeParsedState({
      morphoAuthorizations: [
        {
          authorizer: TEST_OWNER,
          authorized: AUTH,
          before: false,
          after: true,
        },
      ],
    });
    expect(() =>
      checkBlueOperation(ctx, op, state, state, { ...emptyDiff }),
    ).not.toThrow();
  });

  test("error: blueAuthorization flag mismatch throws ConsumerLimitViolationError", () => {
    const op = mkOp({
      type: "blueAuthorization",
      authorized: AUTH,
      expectedIsAuthorized: true,
    });
    const state = makeParsedState({
      morphoAuthorizations: [
        {
          authorizer: TEST_OWNER,
          authorized: AUTH,
          before: false,
          after: false,
        },
      ],
    });
    expect(() =>
      checkBlueOperation(ctx, op, state, state, { ...emptyDiff }),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("error: missing isAuthorized read throws", () => {
    const op = mkOp({ type: "blueAuthorization", authorized: AUTH });
    const empty = makeParsedState();
    expect(() =>
      checkBlueOperation(ctx, op, empty, empty, { ...emptyDiff }),
    ).toThrow();
  });

  test("error: position missing from read state", () => {
    const op = mkOp({ type: "blueSupply", marketId: TEST_MARKET_ID });
    const empty = makeParsedState();
    expect(() =>
      checkBlueOperation(ctx, op, empty, empty, { ...emptyDiff }),
    ).toThrow();
  });

  describe("blueSupply", () => {
    const minted = MarketUtils.toSupplyShares(
      100n,
      { totalSupplyAssets: 1_000n, totalSupplyShares: 1_000n },
      "Down",
    );
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: minted },
      market: {
        totalSupplyAssets: 1_100n,
        totalSupplyShares: 1_000n + minted,
        liquidityAssets: 1_100n,
      },
    });
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueSupply",
            marketId: TEST_MARKET_ID,
            expectedAssets: 100n,
            minSupplySharesMinted: 1n,
          }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedAssets", { expectedAssets: 99n }],
      ["minSupplySharesMinted", { minSupplySharesMinted: minted + 1n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({ type: "blueSupply", marketId: TEST_MARKET_ID, ...override }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).toThrow();
    });
  });

  describe("blueWithdraw", () => {
    const burned = MarketUtils.toSupplyShares(
      100n,
      { totalSupplyAssets: 1_000n, totalSupplyShares: 1_000n },
      "Up",
    );
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 200n, supplyShares: burned + 200n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: 200n },
      market: { liquidityAssets: 900n },
    });
    const diff = { ...emptyDiff, balances: [balance(TOKEN, 100n)] };
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueWithdraw",
            marketId: TEST_MARKET_ID,
            minAssetsReceived: 1n,
            maxSupplySharesBurned: burned + 1n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["minAssetsReceived", { minAssetsReceived: 999_999n }],
      ["maxSupplySharesBurned", { maxSupplySharesBurned: 1n }],
      ["expectedFullClose", { expectedFullClose: true }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({ type: "blueWithdraw", marketId: TEST_MARKET_ID, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow();
    });
  });

  describe("blueSupplyCollateral", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { collateral: 100n },
      market: { oraclePrice: 10n ** 36n },
    });
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueSupplyCollateral",
            marketId: TEST_MARKET_ID,
            expectedAssets: 100n,
          }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedAssets", { expectedAssets: 99n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: 0n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueSupplyCollateral",
            marketId: TEST_MARKET_ID,
            ...override,
          }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).toThrow();
    });
  });

  describe("blueBorrow", () => {
    const minted = MarketUtils.toBorrowShares(
      100n,
      { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      "Up",
    );
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { collateral: 1_000n },
      market: {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
        liquidityAssets: 10_000n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: {
        collateral: 1_000n,
        borrowAssets: 100n,
        borrowShares: minted,
      },
      market: {
        totalBorrowAssets: 1_100n,
        totalBorrowShares: 1_000n + minted,
        liquidityAssets: 9_900n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    });
    const diff = { ...emptyDiff, balances: [balance(TOKEN, 100n)] };
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueBorrow",
            marketId: TEST_MARKET_ID,
            expectedAssets: 100n,
            maxBorrowSharesMinted: minted + 1n,
            maxLtvAfterWad: 10n ** 18n,
            maxUtilizationAfterWad: 2n * 10n ** 18n,
            maxAfterBorrowApyWad: 10n ** 18n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedAssets", { expectedAssets: 99n }],
      ["maxBorrowSharesMinted", { maxBorrowSharesMinted: 1n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: 0n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: -1n }],
      ["maxAfterBorrowApyWad", { maxAfterBorrowApyWad: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({ type: "blueBorrow", marketId: TEST_MARKET_ID, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow();
    });
  });

  describe("blueSupplyCollateralBorrow", () => {
    const minted = MarketUtils.toBorrowShares(
      100n,
      { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      "Up",
    );
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
        liquidityAssets: 10_000n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: {
        collateral: 1_000n,
        borrowAssets: 100n,
        borrowShares: minted,
      },
      market: {
        totalBorrowAssets: 1_100n,
        totalBorrowShares: 1_000n + minted,
        liquidityAssets: 9_900n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    });
    const diff = { ...emptyDiff, balances: [balance(TOKEN, 100n)] };
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueSupplyCollateralBorrow",
            marketId: TEST_MARKET_ID,
            expectedCollateralAssets: 1_000n,
            expectedBorrowAssets: 100n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedCollateralAssets", { expectedCollateralAssets: 99n }],
      ["expectedBorrowAssets", { expectedBorrowAssets: 99n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueSupplyCollateralBorrow",
            marketId: TEST_MARKET_ID,
            ...override,
          }),
          before,
          after,
          diff,
        ),
      ).toThrow();
    });
  });

  describe("blueRepay", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: {
        collateral: 1_000n,
        borrowAssets: 200n,
        borrowShares: 200n,
      },
      market: {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
        oraclePrice: 10n ** 36n,
      },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { collateral: 1_000n },
      market: {
        totalBorrowAssets: 800n,
        totalBorrowShares: 800n,
        oraclePrice: 10n ** 36n,
      },
    });
    const diff = { ...emptyDiff, balances: [balance(TOKEN, -200n)] };
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueRepay",
            marketId: TEST_MARKET_ID,
            expectedFullClose: true,
            maxAssetsPaid: 300n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedFullClose", { expectedFullClose: false }],
      ["maxAssetsPaid", { maxAssetsPaid: 100n }],
      ["minBorrowSharesBurned", { minBorrowSharesBurned: 999n }],
      ["maxResidualBorrowShares", { maxResidualBorrowShares: -1n }],
      ["minRefundAssets", { minRefundAssets: 1n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({ type: "blueRepay", marketId: TEST_MARKET_ID, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow();
    });
  });

  describe("blueRepayWithdrawCollateral", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: {
        collateral: 1_000n,
        borrowAssets: 200n,
        borrowShares: 200n,
      },
      market: {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
        oraclePrice: 10n ** 36n,
      },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { collateral: 800n },
      market: {
        totalBorrowAssets: 800n,
        totalBorrowShares: 800n,
        oraclePrice: 10n ** 36n,
      },
    });
    const diff = {
      ...emptyDiff,
      balances: [balance(TOKEN, -200n)],
    };
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueRepayWithdrawCollateral",
            marketId: TEST_MARKET_ID,
            expectedWithdrawAssets: 200n,
            expectedFullClose: true,
            maxAssetsPaid: 300n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedWithdrawAssets", { expectedWithdrawAssets: 99n }],
      ["maxAssetsPaid", { maxAssetsPaid: 100n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueRepayWithdrawCollateral",
            marketId: TEST_MARKET_ID,
            ...override,
          }),
          before,
          after,
          diff,
        ),
      ).toThrow();
    });
  });

  describe("blueWithdrawCollateral", () => {
    const WETH = getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { collateral: 1_000n },
      market: { oraclePrice: 10n ** 36n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { collateral: 800n },
      market: { oraclePrice: 10n ** 36n },
    });
    const diff = { ...emptyDiff, balances: [balance(WETH, 200n)] };
    test("pass", () => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueWithdrawCollateral",
            marketId: TEST_MARKET_ID,
            expectedAssets: 200n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedAssets", { expectedAssets: 99n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: 0n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkBlueOperation(
          ctx,
          mkOp({
            type: "blueWithdrawCollateral",
            marketId: TEST_MARKET_ID,
            ...override,
          }),
          before,
          after,
          diff,
        ),
      ).toThrow();
    });
  });
});

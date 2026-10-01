import type { MarketId } from "@morpho-org/blue-sdk";
import { MarketUtils } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  StateChangeMismatchError,
} from "../../errors.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import type { ParsedState } from "../state/types.js";
import { checkRefinanceOperation } from "./refinance.js";

const TARGET_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const ctx = makeCheckContext();
type Op = Parameters<typeof checkRefinanceOperation>[1];

/** Merge two single-market states into one ParsedState. */
const merge = (a: ParsedState, b: ParsedState): ParsedState =>
  makeParsedState({
    markets: [...a.markets, ...b.markets],
    positions: [...a.positions, ...b.positions],
    internals: {
      markets: new Map([...a.internals.markets, ...b.internals.markets]),
      vaults: new Map([...a.internals.vaults, ...b.internals.vaults]),
      positions: new Map([...a.internals.positions, ...b.internals.positions]),
    },
  });

const repaidShares = MarketUtils.toBorrowShares(
  200n,
  { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
  "Up",
);

const baseBefore = () =>
  merge(
    makeMarketState({
      marketId: TEST_MARKET_ID,
      position: {
        collateral: 300n,
        borrowAssets: 200n,
        borrowShares: repaidShares,
      },
      market: {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    }),
    makeMarketState({
      marketId: TARGET_ID,
      market: {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
        liquidityAssets: 10_000n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    }),
  );

const baseAfter = () =>
  merge(
    makeMarketState({
      marketId: TEST_MARKET_ID,
      market: {
        totalBorrowAssets: 800n,
        totalBorrowShares: 1_000n - repaidShares,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    }),
    makeMarketState({
      marketId: TARGET_ID,
      position: {
        collateral: 300n,
        borrowAssets: 200n,
        borrowShares: repaidShares,
      },
      market: {
        totalBorrowAssets: 1_200n,
        totalBorrowShares: 1_000n + repaidShares,
        liquidityAssets: 9_800n,
        oraclePrice: 10n ** 36n,
      },
      internals: { rateAtTargetPerSecondWad: 0n },
    }),
  );

const limit = (over: object = {}): Op =>
  ({
    type: "blueRefinance",
    sourceMarketId: TEST_MARKET_ID,
    targetMarketId: TARGET_ID,
    ...over,
  }) as Op;

describe("checkRefinanceOperation", () => {
  test("error: source market missing from read state", () => {
    const empty = makeParsedState();
    expect(() =>
      checkRefinanceOperation(ctx, limit(), empty, empty, { ...emptyDiff }),
    ).toThrow(StateChangeMismatchError);
  });

  test("pass: source closed, collateral moved, debt minted", () => {
    expect(() =>
      checkRefinanceOperation(ctx, limit(), baseBefore(), baseAfter(), {
        ...emptyDiff,
      }),
    ).not.toThrow();
  });

  test.each<[string, object]>([
    ["maxTargetBorrowAssets", { maxTargetBorrowAssets: 100n }],
    ["maxTargetBorrowSharesMinted", { maxTargetBorrowSharesMinted: 1n }],
    ["maxSourceResidualBorrowShares", { maxSourceResidualBorrowShares: -1n }],
    ["maxTargetLtvAfterWad", { maxTargetLtvAfterWad: 0n }],
    [
      "minTargetHealthFactorAfterWad",
      { minTargetHealthFactorAfterWad: 10n ** 36n },
    ],
    ["maxLoanDustAssets", { maxLoanDustAssets: -1n }],
  ])("violation: %s", (_f, override) => {
    expect(() =>
      checkRefinanceOperation(ctx, limit(override), baseBefore(), baseAfter(), {
        ...emptyDiff,
      }),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("error: source not fully closed", () => {
    const after = merge(
      makeMarketState({
        marketId: TEST_MARKET_ID,
        position: { collateral: 10n },
        market: { oraclePrice: 10n ** 36n },
      }),
      makeMarketState({
        marketId: TARGET_ID,
        position: { collateral: 290n, borrowShares: repaidShares },
        market: {
          totalBorrowAssets: 1_200n,
          totalBorrowShares: 1_000n + repaidShares,
          oraclePrice: 10n ** 36n,
        },
        internals: { rateAtTargetPerSecondWad: 0n },
      }),
    );
    expect(() =>
      checkRefinanceOperation(ctx, limit(), baseBefore(), after, {
        ...emptyDiff,
      }),
    ).toThrow(StateChangeMismatchError);
  });

  test("loan dust beyond the slippage bound throws", () => {
    const diff = {
      ...emptyDiff,
      balances: [
        {
          account: TEST_OWNER,
          token: TOKEN,
          before: 0n,
          after: 500n,
          assets: 500n,
        },
      ],
    };
    expect(() =>
      checkRefinanceOperation(ctx, limit(), baseBefore(), baseAfter(), diff),
    ).toThrow(ConsumerLimitViolationError);
  });
});

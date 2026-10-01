import type { MarketId } from "@morpho-org/blue-sdk";
import { MarketUtils } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkRefinanceOperation } from "./refinance.js";

const TARGET_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId;
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const market = (marketId: MarketId) => ({
  marketId,
  params: {
    loanToken: TOKEN,
    collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    oracle: getAddress("0x0000000000000000000000000000000000000001"),
    irm: getAddress("0x0000000000000000000000000000000000000002"),
    lltv: 900000000000000000n,
  },
});

describe("checkRefinanceOperation", () => {
  test("error: source market missing from read state", () => {
    const op = {
      type: "blueRefinance",
      transactionIndex: 0,
      sourceMarket: market(TEST_MARKET_ID),
      targetMarket: market(TARGET_ID),
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
    } as unknown as Parameters<typeof checkRefinanceOperation>[1];
    const empty = makeParsedState();
    expect(() =>
      checkRefinanceOperation(makeCheckContext(), op, empty, empty, {
        ...emptyDiff,
      }),
    ).toThrow();
  });
});

describe("checkRefinanceOperation — loan dust", () => {
  test("error: owner net loan-token inflow beyond the slippage bound", async () => {
    const { SlippageLimitExceededError } = await import("../../errors.js");
    const source = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      position: { borrowShares: 100n, collateral: 300n },
    });
    const sourceClosed = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      position: { borrowShares: 0n, collateral: 0n },
    });
    const targetBefore = makeMarketState({
      marketId: TARGET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
    });
    const repaid = MarketUtils.toBorrowAssets(
      100n,
      {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
      },
      "Up",
    );
    const minted = MarketUtils.toBorrowShares(
      repaid,
      {
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
      },
      "Up",
    );
    const targetAfter = makeMarketState({
      marketId: TARGET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      position: { borrowShares: minted, collateral: 300n },
    });
    const merge = (
      a: ReturnType<typeof makeMarketState>,
      b: ReturnType<typeof makeMarketState>,
    ) =>
      makeParsedState({
        markets: [...a.markets, ...b.markets],
        positions: [...a.positions, ...b.positions],
        internals: {
          markets: new Map([...a.internals.markets, ...b.internals.markets]),
          vaults: new Map(),
          positions: new Map([
            ...a.internals.positions,
            ...b.internals.positions,
          ]),
        },
      });
    const op = {
      type: "blueRefinance",
      transactionIndex: 0,
      sourceMarket: market(TEST_MARKET_ID),
      targetMarket: market(TARGET_ID),
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
      reallocations: [],
    } as unknown as Parameters<typeof checkRefinanceOperation>[1];
    expect(() =>
      checkRefinanceOperation(
        makeCheckContext(),
        op,
        merge(source, targetBefore),
        merge(sourceClosed, targetAfter),
        {
          ...emptyDiff,
          balances: [{ account: TEST_OWNER, token: TOKEN, assets: 10n }],
        },
      ),
    ).toThrow(SlippageLimitExceededError);
  });
});

describe("checkRefinanceOperation — consumer limits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({ limits: { ...makeCheckContext().limits, operations } });

  const OTHER_ID =
    "0x0000000000000000000000000000000000000000000000000000000000000bad" as MarketId;

  const repaid = MarketUtils.toBorrowAssets(
    100n,
    { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
    "Up",
  );
  const minted = MarketUtils.toBorrowShares(
    repaid,
    { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
    "Up",
  );
  const source = makeMarketState({
    marketId: TEST_MARKET_ID,
    market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
    position: { borrowShares: 100n, collateral: 300n },
  });
  const sourceClosed = makeMarketState({
    marketId: TEST_MARKET_ID,
    market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
    position: { borrowShares: 0n, collateral: 0n },
  });
  const targetBefore = makeMarketState({
    marketId: TARGET_ID,
    market: {
      totalBorrowAssets: 1_000n,
      totalBorrowShares: 1_000n,
      oraclePrice: 10n ** 36n,
    },
    internals: { rateAtTargetPerSecondWad: 0n },
  });
  const targetAfter = makeMarketState({
    marketId: TARGET_ID,
    market: {
      totalBorrowAssets: 1_000n,
      totalBorrowShares: 1_000n,
      oraclePrice: 10n ** 36n,
    },
    internals: { rateAtTargetPerSecondWad: 0n },
    position: { borrowShares: minted, collateral: 300n },
  });
  const merged = (
    a: ReturnType<typeof makeMarketState>,
    b: ReturnType<typeof makeMarketState>,
  ) =>
    makeParsedState({
      markets: [...a.markets, ...b.markets],
      positions: [...a.positions, ...b.positions],
      internals: {
        markets: new Map([...a.internals.markets, ...b.internals.markets]),
        vaults: new Map(),
        positions: new Map([
          ...a.internals.positions,
          ...b.internals.positions,
        ]),
      },
    });
  const before = merged(source, targetBefore);
  const after = merged(sourceClosed, targetAfter);

  const op = {
    type: "blueRefinance",
    transactionIndex: 0,
    sourceMarket: market(TEST_MARKET_ID),
    targetMarket: market(TARGET_ID),
    onBehalf: TEST_OWNER,
    receiver: TEST_OWNER,
    reallocations: [],
  } as unknown as Parameters<typeof checkRefinanceOperation>[1];

  const call = (limits: OperationLimit[]) => () =>
    checkRefinanceOperation(ctxWith(limits), op, before, after, {
      ...emptyDiff,
    });

  test("pass: all fields satisfied", () => {
    expect(
      call([
        {
          type: "blueRefinance",
          sourceMarketId: TEST_MARKET_ID,
          targetMarketId: TARGET_ID,
          maxTargetBorrowAssets: 10n ** 30n,
          maxTargetBorrowSharesMinted: 10n ** 30n,
          maxSourceResidualBorrowShares: 10n ** 30n,
          maxTargetLtvAfterWad: 10n ** 30n,
          minTargetHealthFactorAfterWad: 0n,
          maxLoanDustAssets: 10n ** 30n,
          maxReallocationPenaltyAssets: 10n ** 30n,
        },
      ]),
    ).not.toThrow();
  });
  test.each<[string, object]>([
    ["sourceMarketId", { sourceMarketId: OTHER_ID }],
    ["targetMarketId", { targetMarketId: OTHER_ID }],
    ["maxTargetBorrowAssets", { maxTargetBorrowAssets: 0n }],
    ["maxTargetBorrowSharesMinted", { maxTargetBorrowSharesMinted: 0n }],
    ["maxSourceResidualBorrowShares", { maxSourceResidualBorrowShares: -1n }],
    ["maxTargetLtvAfterWad", { maxTargetLtvAfterWad: -1n }],
    [
      "minTargetHealthFactorAfterWad",
      { minTargetHealthFactorAfterWad: 10n ** 30n },
    ],
    ["maxLoanDustAssets", { maxLoanDustAssets: -1n }],
    ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
  ])("violation: %s", (_f, override) => {
    expect(
      call([
        {
          type: "blueRefinance",
          sourceMarketId: TEST_MARKET_ID,
          targetMarketId: TARGET_ID,
          ...override,
        } as OperationLimit,
      ]),
    ).toThrow(ConsumerLimitViolationError);
  });
});

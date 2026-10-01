import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  makeCheckContext,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import type { CheckedOperation } from "./helpers.js";
import { checkRefinanceLimits, checkRefinanceOperation } from "./refinance.js";

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
      checkRefinanceOperation(makeCheckContext(), op, empty, empty),
    ).toThrow();
  });
});

describe("checkRefinanceLimits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({ limits: { ...makeCheckContext().limits, operations } });

  const OTHER_ID =
    "0x0000000000000000000000000000000000000000000000000000000000000bad" as MarketId;
  const op = {
    type: "blueRefinance",
    transactionIndex: 0,
    sourceMarket: market(TEST_MARKET_ID),
    targetMarket: market(TARGET_ID),
  };
  const outcome = {
    targetBorrowAssets: 100n,
    targetBorrowSharesMinted: 100n,
    sourceResidualBorrowShares: 10n,
    targetLtvAfterWad: { type: "finite", valueWad: 100n },
    targetHealthFactorAfterWad: { type: "finite", valueWad: 200n },
    loanDustAssets: 1n,
    reallocationPenaltyAssets: 0n,
  };
  const checked = { operation: op, outcome } as unknown as CheckedOperation;

  test("pass: all fields satisfied", () => {
    const limit: OperationLimit = {
      type: "blueRefinance",
      sourceMarketId: TEST_MARKET_ID,
      targetMarketId: TARGET_ID,
      maxTargetBorrowAssets: 200n,
      maxTargetBorrowSharesMinted: 200n,
      maxSourceResidualBorrowShares: 20n,
      maxTargetLtvAfterWad: 200n,
      minTargetHealthFactorAfterWad: 100n,
      maxLoanDustAssets: 5n,
      maxReallocationPenaltyAssets: 0n,
    };
    expect(() => checkRefinanceLimits(ctxWith([limit]), checked)).not.toThrow();
  });
  test.each<[string, object]>([
    ["sourceMarketId", { sourceMarketId: OTHER_ID }],
    ["targetMarketId", { targetMarketId: OTHER_ID }],
    ["maxTargetBorrowAssets", { maxTargetBorrowAssets: 99n }],
    ["maxTargetBorrowSharesMinted", { maxTargetBorrowSharesMinted: 99n }],
    ["maxSourceResidualBorrowShares", { maxSourceResidualBorrowShares: 9n }],
    ["maxTargetLtvAfterWad", { maxTargetLtvAfterWad: 99n }],
    ["minTargetHealthFactorAfterWad", { minTargetHealthFactorAfterWad: 201n }],
    ["maxLoanDustAssets", { maxLoanDustAssets: 0n }],
    ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
  ])("violation: %s", (_field, override) => {
    const limit = {
      type: "blueRefinance",
      sourceMarketId: TEST_MARKET_ID,
      targetMarketId: TARGET_ID,
      ...override,
    } as OperationLimit;
    expect(() => checkRefinanceLimits(ctxWith([limit]), checked)).toThrow(
      ConsumerLimitViolationError,
    );
  });
});

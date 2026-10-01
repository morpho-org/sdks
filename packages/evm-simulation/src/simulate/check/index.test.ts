import type { MarketId } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import type { OperationLimit } from "../../limits.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkOperations } from "./index.js";

const MARKET_ID =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

describe("checkOperations", () => {
  test("empty limits → no operations", () => {
    const state = makeMarketState({ marketId: MARKET_ID });
    const { operations } = checkOperations({
      ctx: makeCheckContext(),
      accruedBefore: state,
      after: state,
      actionDiff: { ...emptyDiff },
    });
    expect(operations).toHaveLength(0);
  });

  test("each limit entry is checked and echoed as the operation subject", () => {
    const before = makeMarketState({ marketId: MARKET_ID });
    const after = makeMarketState({
      marketId: MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: 100n },
    });
    const limit: OperationLimit = {
      type: "blueSupply",
      marketId: MARKET_ID,
      transactionIndex: 2,
      minSupplySharesMinted: 1n,
    };
    const { operations } = checkOperations({
      ctx: makeCheckContext({
        limits: { ...makeCheckContext().limits, operations: [limit] },
        owner: TEST_OWNER,
      }),
      accruedBefore: before,
      after,
      actionDiff: { ...emptyDiff },
    });
    expect(operations).toEqual([
      {
        transactionIndex: 2,
        operation: "blueSupply",
        marketId: MARKET_ID,
      },
    ]);
  });
});

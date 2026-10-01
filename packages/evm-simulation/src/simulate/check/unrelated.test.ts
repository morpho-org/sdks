import type { MarketId } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import { StateChangeMismatchError } from "../../errors.js";
import {
  makeCheckContext,
  makeMarketState,
  TEST_MARKET_ID,
} from "../../test-helpers/index.js";
import { checkUnrelatedState } from "./unrelated.js";

const ctx = makeCheckContext();

describe("checkUnrelatedState", () => {
  test("identical states pass", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    expect(() =>
      checkUnrelatedState({
        ctx,
        accruedBefore: before,
        after: before,
        touchedMarketIds: new Set<MarketId>(),
      }),
    ).not.toThrow();
  });

  test("error: untouched position that changed", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyShares: 5n },
    });
    expect(() =>
      checkUnrelatedState({
        ctx,
        accruedBefore: before,
        after,
        touchedMarketIds: new Set(),
      }),
    ).toThrow(StateChangeMismatchError);
  });

  test("touched market may change", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyShares: 5n },
      market: { totalSupplyAssets: 1_100n },
    });
    expect(() =>
      checkUnrelatedState({
        ctx,
        accruedBefore: before,
        after,
        touchedMarketIds: new Set([TEST_MARKET_ID]),
      }),
    ).not.toThrow();
  });

  test("positions of other users are ignored when not read", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const other = makeMarketState({
      marketId: TEST_MARKET_ID,
      owner: "0x3333333333333333333333333333333333333333",
      position: { supplyShares: 9n },
    });
    expect(() =>
      checkUnrelatedState({
        ctx,
        accruedBefore: before,
        after: other,
        touchedMarketIds: new Set(),
      }),
    ).not.toThrow();
  });
});

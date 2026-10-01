import { describe, expect, test } from "vitest";
import { makeMarketState, TEST_MARKET_ID } from "../../test-helpers/index.js";
import { accrue } from "./accrue.js";

describe("accrue", () => {
  test("markets accrue interest to the target timestamp", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: {
        totalSupplyAssets: 1_000_000n,
        totalSupplyShares: 1_000_000n,
        totalBorrowAssets: 500_000n,
        totalBorrowShares: 500_000n,
        liquidityAssets: 500_000n,
      },
      internals: { rateAtTargetPerSecondWad: 31_556_952n },
    });
    const accrued = accrue(before, 1_700_000_100n);
    const market = accrued.markets.find((m) => m.marketId === TEST_MARKET_ID)!;
    expect(market.lastUpdate).toBe(1_700_000_100n);
  });

  test("markets without internals pass through unchanged", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const accrued = accrue(before, before.markets[0]!.lastUpdate);
    expect(accrued.markets[0]?.marketId).toBe(TEST_MARKET_ID);
    expect(accrued.markets[0]?.totalSupplyAssets).toBe(
      before.markets[0]!.totalSupplyAssets,
    );
    expect(accrued.markets[0]?.totalBorrowAssets).toBe(
      before.markets[0]!.totalBorrowAssets,
    );
  });
});

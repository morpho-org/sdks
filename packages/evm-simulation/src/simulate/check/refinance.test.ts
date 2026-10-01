import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  makeCheckContext,
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
      checkRefinanceOperation(makeCheckContext(), op, empty, empty),
    ).toThrow();
  });
});

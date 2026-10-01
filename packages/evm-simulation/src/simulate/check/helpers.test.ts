import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  makeCheckContext,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { findPosition, operationSubject, receiverCredit } from "./helpers.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

describe("check helpers", () => {
  test("operationSubject maps each decoded type to its subject keys", () => {
    const op = {
      type: "blueSupply",
      market: { marketId: TEST_MARKET_ID },
    } as DecodedOperation;
    expect(operationSubject(op)).toEqual({
      operation: "blueSupply",
      marketId: TEST_MARKET_ID,
    });
    const refinance = {
      type: "blueRefinance",
      sourceMarket: { marketId: TEST_MARKET_ID },
      targetMarket: {
        marketId:
          "0x1111111111111111111111111111111111111111111111111111111111111111" as MarketId,
      },
    } as DecodedOperation;
    expect(operationSubject(refinance)).toEqual({
      operation: "blueRefinance",
      sourceMarketId: TEST_MARKET_ID,
      targetMarketId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    });
  });

  test("receiverCredit sums diffs over one pair", () => {
    const credit = receiverCredit(
      {
        balances: [
          { account: TEST_OWNER, token: TOKEN, assets: 5n },
          { account: TEST_OWNER, token: TOKEN, assets: -2n },
          {
            account: getAddress("0x3333333333333333333333333333333333333333"),
            token: TOKEN,
            assets: 99n,
          },
        ],
        allowances: [],
        morphoAuthorizations: [],
        nonces: [],
        positions: [],
        markets: [],
        vaults: [],
      },
      TEST_OWNER,
      TOKEN,
    );
    expect(credit).toBe(3n);
  });

  test("findPosition matches marketId+user, case-insensitive on user", () => {
    const state = makeParsedState({
      positions: [
        {
          marketId: TEST_MARKET_ID,
          user: TEST_OWNER,
          supplyAssets: 0n,
          supplyShares: 1n,
          borrowAssets: 0n,
          borrowShares: 0n,
          collateral: 0n,
        },
      ],
    });
    expect(
      findPosition(
        state,
        TEST_MARKET_ID,
        TEST_OWNER,
        makeCheckContext(),
        {} as DecodedOperation,
      ).supplyShares,
    ).toBe(1n);
  });
});

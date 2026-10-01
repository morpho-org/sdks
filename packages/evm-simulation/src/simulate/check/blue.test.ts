import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkBlueOperation, fundingDebitOverrides } from "./blue.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const ctx = makeCheckContext();

const market = {
  marketId: TEST_MARKET_ID,
  params: {
    loanToken: TOKEN,
    collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    oracle: getAddress("0x0000000000000000000000000000000000000001"),
    irm: getAddress("0x0000000000000000000000000000000000000002"),
    lltv: 900000000000000000n,
  },
} as const;

describe("checkBlueOperation", () => {
  test("blueAuthorization returns the requested flag", () => {
    const op = {
      type: "blueAuthorization",
      transactionIndex: 0,
      authorized: getAddress("0x3333333333333333333333333333333333333333"),
      isAuthorized: true,
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const checked = checkBlueOperation(
      ctx,
      op,
      makeParsedState(),
      makeParsedState(),
    );
    expect(checked.outcome).toEqual({ isAuthorized: true });
  });

  test("error: position missing from read state", () => {
    const op = {
      type: "blueSupply",
      transactionIndex: 0,
      market,
      assets: 100n,
      onBehalf: TEST_OWNER,
      funding: { type: "erc20", token: TOKEN, assets: 100n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const empty = makeParsedState();
    expect(() => checkBlueOperation(ctx, op, empty, empty)).toThrow();
  });

  test("blueSupply: position grows by the exact minted shares", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: 100_000n },
      market: {
        totalSupplyAssets: 1_100n,
        totalSupplyShares: 101_000n,
        liquidityAssets: 1_100n,
      },
    });
    const op = {
      type: "blueSupply",
      transactionIndex: 0,
      market,
      assets: 100n,
      onBehalf: TEST_OWNER,
      funding: { type: "erc20", token: TOKEN, assets: 100n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const checked = checkBlueOperation(ctx, op, before, after);
    expect(
      (checked.outcome as { supplySharesMinted: bigint }).supplySharesMinted,
    ).toBe(100_000n);
  });
});

describe("fundingDebitOverrides", () => {
  test("empty for non-repay operations", () => {
    const op = {
      type: "blueSupply",
      funding: { type: "erc20", token: TOKEN, assets: 5n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    expect(
      fundingDebitOverrides([op], makeParsedState(), TEST_OWNER).size,
    ).toBe(0);
  });
});

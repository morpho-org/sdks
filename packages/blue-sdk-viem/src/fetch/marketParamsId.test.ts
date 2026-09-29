import {
  type IMarketParams,
  type MarketId,
  MarketUtils,
} from "@morpho-org/blue-sdk";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { MarketParamsIdMismatchError } from "../error.js";
import { validateMarketParamsId } from "./marketParamsId.js";

const MARKET_PARAMS: IMarketParams = {
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralToken: "0x0000000000000000000000000000000000000002",
  oracle: "0x0000000000000000000000000000000000000003",
  irm: "0x0000000000000000000000000000000000000004",
  lltv: 860000000000000000n,
};

describe("validateMarketParamsId", () => {
  test("accepts params that hash to the requested id", () => {
    const id = MarketUtils.getMarketId(MARKET_PARAMS);

    expect(() => validateMarketParamsId(id, MARKET_PARAMS)).not.toThrow();
  });

  test("behavior: accepts an uppercase requested id", () => {
    const id = MarketUtils.getMarketId(MARKET_PARAMS).toUpperCase() as MarketId;

    expect(() => validateMarketParamsId(id, MARKET_PARAMS)).not.toThrow();
  });

  test("behavior: accepts all-zero params for an uncreated market", () => {
    expect(() =>
      validateMarketParamsId(MarketUtils.getMarketId(MARKET_PARAMS), {
        loanToken: zeroAddress,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      }),
    ).not.toThrow();
  });

  test("error: MarketParamsIdMismatchError", () => {
    const marketId = MarketUtils.getMarketId({
      ...MARKET_PARAMS,
      lltv: 800000000000000000n,
    });
    const receivedMarketId = MarketUtils.getMarketId(MARKET_PARAMS);

    let error: unknown;
    try {
      validateMarketParamsId(marketId, MARKET_PARAMS);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(MarketParamsIdMismatchError);
    expect(error).toMatchObject({ marketId, receivedMarketId });
  });

  test("error: rejects a partly-zero idle market", () => {
    const requestedId = MarketUtils.getMarketId(MARKET_PARAMS);
    const params: IMarketParams = {
      loanToken: MARKET_PARAMS.loanToken,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    };

    expect(() => validateMarketParamsId(requestedId, params)).toThrow(
      MarketParamsIdMismatchError,
    );
  });

  test("error: rejects all-zero addresses with nonzero LLTV", () => {
    const requestedId = MarketUtils.getMarketId(MARKET_PARAMS);
    const params: IMarketParams = {
      loanToken: zeroAddress,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 1n,
    };

    expect(() => validateMarketParamsId(requestedId, params)).toThrow(
      MarketParamsIdMismatchError,
    );
  });
});

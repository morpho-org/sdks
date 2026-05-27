import { encodeAbiParameters } from "viem";
import { describe, expect, test } from "vitest";
import { LOAN_TOKEN, marketParams } from "../__test__/fixtures.js";
import {
  InvalidMarketParamsError,
  UnknownMarketParamsError,
} from "../errors.js";
import type { MarketId } from "../types.js";
import { MarketParams, marketParamsAbi } from "./MarketParams.js";

describe("MarketParams", () => {
  test("get returns the cached params by id", () => {
    const params = new MarketParams(marketParams());

    expect(MarketParams.get(params.id)).toBe(params);
  });

  test("get throws when the id is not cached", () => {
    expect(() =>
      MarketParams.get(
        "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0" as MarketId,
      ),
    ).toThrow(UnknownMarketParamsError);
  });

  test("idle builds the canonical zero-collateral market", () => {
    const params = MarketParams.idle(LOAN_TOKEN);

    expect(params.loanToken).toBe(LOAN_TOKEN);
    expect(params.collateralToken).toBe(
      "0x0000000000000000000000000000000000000000",
    );
    expect(params.lltv).toBe(0n);
  });

  test("fromHex decodes market params", () => {
    const input = new MarketParams(marketParams());
    const encoded = encodeAbiParameters([marketParamsAbi], [input]);

    expect(MarketParams.fromHex(encoded)).toMatchObject(input);
  });

  test("fromHex throws a typed error on invalid data", () => {
    expect(() => MarketParams.fromHex("0x1234")).toThrow(
      InvalidMarketParamsError,
    );
  });
});

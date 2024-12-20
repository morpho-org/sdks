import { describe, expect } from "vitest";
import { test } from "./setup";

import {
  ChainId,
  ExchangeRateWrappedToken,
  addresses,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { Token } from "../../src/augment/Token";

const { mkr, usdc, stEth, wstEth } = addresses[ChainId.EthMainnet];

describe("augment/Token", () => {
  test("should fetch token data", async ({ wallet }) => {
    const expectedData = new Token({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(usdc, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch wrapped token data", async ({ wallet }) => {
    const expectedData = new ExchangeRateWrappedToken(
      {
        address: wstEth,
        decimals: 18,
        symbol: "wstETH",
        name: "Wrapped liquid staked Ether 2.0",
      },
      stEth,
      expect.any(BigInt),
    );

    const value = await Token.fetch(wstEth, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch MKR token data", async ({ wallet }) => {
    const expectedData = new Token({
      address: mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(mkr, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch invalid ERC20", async ({ wallet }) => {
    const expectedData = new Token({ address: randomAddress() });

    const value = await Token.fetch(expectedData.address, wallet);

    expect(value).toStrictEqual(expectedData);
  });
});

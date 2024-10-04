import { describe, expect } from "vitest";
import { test } from "./setup.js";

import {
  ChainId,
  ExchangeRateWrappedToken,
  addresses,
} from "@morpho-org/blue-sdk";
import { Token } from "../src/augment/Token.js";

describe("augment/Token", () => {
  test("should fetch token data", async ({ client }) => {
    const expectedData = new Token({
      address: addresses[ChainId.EthMainnet].usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(addresses[ChainId.EthMainnet].usdc, client);

    expect(value).to.eql(expectedData);
  });

  test("should fetch wrapped token data", async ({ client }) => {
    const expectedData = new ExchangeRateWrappedToken(
      {
        address: addresses[ChainId.EthMainnet].wstEth,
        decimals: 18,
        symbol: "wstETH",
        name: "Wrapped liquid staked Ether 2.0",
      },
      addresses[ChainId.EthMainnet].stEth,
      expect.any(BigInt),
    );

    const value = await Token.fetch(
      addresses[ChainId.EthMainnet].wstEth,
      client,
    );

    expect(value).to.eql(expectedData);
  });

  test("Should fetch MKR token data", async ({ client }) => {
    const expectedData = new Token({
      address: addresses[ChainId.EthMainnet].mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(addresses[ChainId.EthMainnet].mkr, client);

    expect(value).to.eql(expectedData);
  });
});

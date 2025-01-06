import { describe, expect } from "vitest";
import { test } from "./setup";

import {
  ChainId,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  addresses,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { zeroHash } from "viem";
import { Token } from "../src/augment/Token";

const { mkr, usdc, stEth, wstEth } = addresses[ChainId.EthMainnet];

describe("augment/Token", () => {
  test("should fetch token data", async ({ client }) => {
    const expectedData = new Token({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(usdc, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch wrapped token data", async ({ client }) => {
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

    const value = await Token.fetch(wstEth, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch MKR token data", async ({ client }) => {
    const expectedData = new Token({
      address: mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(mkr, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch invalid ERC20", async ({ client }) => {
    const expectedData = new Token({ address: randomAddress() });

    const value = await Token.fetch(expectedData.address, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch token data with eip5267Domain", async ({ client }) => {
    const steakUSDC = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
    const expectedData = new Token({
      address: steakUSDC,
      decimals: 18,
      symbol: "steakUSDC",
      name: "Steakhouse USDC",
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "Steakhouse USDC",
        version: "1",
        chainId: 1n,
        verifyingContract: steakUSDC,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const value = await Token.fetch(expectedData.address, client);

    expect(value).toStrictEqual(expectedData);
  });
});

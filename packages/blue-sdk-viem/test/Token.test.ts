import { expect } from "chai";

import { viem } from "hardhat";
import {
  Account,
  Chain,
  Client,
  PublicActions,
  TestActions,
  Transport,
  WalletActions,
  WalletRpcSchema,
  publicActions,
  testActions,
} from "viem";

import {
  ChainId,
  ExchangeRateWrappedToken,
  addresses,
} from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";
import { Token } from "../src/augment/Token";

describe("augment/Token", () => {
  let client: Client<
    Transport,
    Chain,
    Account,
    WalletRpcSchema,
    WalletActions<Chain, Account> &
      PublicActions<Transport, Chain, Account> &
      TestActions
  >;

  setUp(async () => {
    client = (await viem.getWalletClients())[0]!
      .extend(publicActions)
      .extend(testActions({ mode: "hardhat" }));
  });

  test("should fetch token data", async () => {
    const expectedData = new Token({
      address: addresses[ChainId.EthMainnet].usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(addresses[ChainId.EthMainnet].usdc, client);

    expect(value).to.eql(expectedData);
  });

  test("should fetch wrapped token data", async () => {
    const expectedData = new ExchangeRateWrappedToken(
      {
        address: addresses[ChainId.EthMainnet].wstEth,
        decimals: 18,
        symbol: "wstETH",
        name: "Wrapped liquid staked Ether 2.0",
      },
      addresses[ChainId.EthMainnet].stEth,
      expect.bigint,
    );

    const value = await Token.fetch(
      addresses[ChainId.EthMainnet].wstEth,
      client,
    );

    expect(value).to.eql(expectedData);
  });

  test("Should fetch MKR token data", async () => {
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

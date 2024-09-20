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
  zeroAddress,
} from "viem";

import {
  ChainId,
  MarketConfig,
  MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";

import "../src/augment/MarketConfig";

describe("augment/MarketConfig", () => {
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

  it("should fetch config from cache", async () => {
    const market = await MarketConfig.fetch(
      MAINNET_MARKETS.usdc_wstEth.id,
      client,
    );

    expect(market).to.eql(MAINNET_MARKETS.usdc_wstEth);
  });

  it("should fetch config from chain", async () => {
    const marketParams = {
      collateralToken: zeroAddress,
      loanToken: addresses[ChainId.EthMainnet].wNative,
      lltv: 0n,
      irm: zeroAddress,
      oracle: zeroAddress,
      id: "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284",
      liquidationIncentiveFactor: 1150000000000000000n,
    };

    const market = await MarketConfig.fetch(
      "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284" as MarketId,
      client,
    );

    expect(market).to.eql(marketParams);
  });
});

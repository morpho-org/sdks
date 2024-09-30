import { setCode, time } from "@nomicfoundation/hardhat-network-helpers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
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

import { ChainId, MarketConfig, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { createRandomAddress, setUp } from "@morpho-org/morpho-test";

import { blueAbi } from "../src/abis";
import { Market } from "../src/augment/Market";

describe("augment/Market", () => {
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

  it("should fetch market data", async () => {
    const expectedData = {
      config: MAINNET_MARKETS.usdc_wstEth,
      totalSupplyAssets: 32212092216793n,
      totalSupplyShares: 31693536738210306937n,
      totalBorrowAssets: 30448219939637n,
      totalBorrowShares: 29909458369905209203n,
      lastUpdate: 1711589915n,
      fee: 0n,
      rateAtTarget: 3386101241n,
      price: 4026279734253409453160432114n,
    };

    const value = await Market.fetch(MAINNET_MARKETS.usdc_wstEth.id, client);

    expect(value).to.eql(expectedData);
  });

  it("should fetch price and rate if idle market", async () => {
    const expectedData = {
      config: MAINNET_MARKETS.idle_usdc,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 1711558175n,
      fee: 0n,
      price: 0n,
      rateAtTarget: undefined,
    };

    const value = await Market.fetch(MAINNET_MARKETS.idle_usdc.id, client);

    expect(value).to.eql(expectedData);
  });

  it("should not fetch rate at target for unknown irm", async () => {
    const { morpho } = addresses[ChainId.EthMainnet];

    const owner = await client.readContract({
      address: morpho,
      abi: blueAbi,
      functionName: "owner",
    });
    await client.impersonateAccount({ address: owner });

    const config = new MarketConfig({
      ...MAINNET_MARKETS.eth_wstEth,
      irm: createRandomAddress(),
    });
    await setCode(
      config.irm,
      (await client.getCode({
        address: MAINNET_MARKETS.eth_wstEth.irm,
      }))!,
    );
    await client.writeContract({
      account: owner,
      address: morpho,
      abi: blueAbi,
      functionName: "enableIrm",
      args: [config.irm],
    });

    const timestamp = await time.latest();
    await setNextBlockTimestamp(timestamp);
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "createMarket",
      args: [{ ...config }],
    });

    const expectedData = {
      config,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: BigInt(timestamp),
      fee: 0n,
      price: 1160095030000000000000000000000000000n,
      rateAtTarget: undefined,
    };

    const value = await Market.fetch(config.id, client);

    expect(value).to.eql(expectedData);
  });
});

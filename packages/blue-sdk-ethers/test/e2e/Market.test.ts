import { ChainId, MarketParams, addressesRegistry } from "@morpho-org/blue-sdk";

import { markets } from "@morpho-org/morpho-test";
import { randomAddress } from "@morpho-org/test";
import { describe, expect } from "vitest";
import { Market } from "../../src/augment/Market";
import { blueAbi } from "./abis";
import { test } from "./setup";

const { morpho, adaptiveCurveIrm } = addressesRegistry[ChainId.EthMainnet];
const { usdc_wstEth, usdc_idle, eth_wstEth, crvUsd_stkcvx2BTC } =
  markets[ChainId.EthMainnet];

describe("augment/Market", () => {
  test("should fetch market data", async ({ wallet }) => {
    const expectedData = new Market({
      params: usdc_wstEth,
      totalSupplyAssets: 32212092216793n,
      totalSupplyShares: 31693536738210306937n,
      totalBorrowAssets: 30448219939637n,
      totalBorrowShares: 29909458369905209203n,
      lastUpdate: 1711589915n,
      fee: 0n,
      rateAtTarget: 3386101241n,
      price: 4026279734253409453160432114n,
    });

    const value = await Market.fetch(usdc_wstEth.id, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch price and rate if idle market", async ({ wallet }) => {
    const expectedData = new Market({
      params: usdc_idle,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 1711558175n,
      fee: 0n,
    });

    const value = await Market.fetch(usdc_idle.id, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should not fetch rate at target for unknown irm", async ({
    client,
    wallet,
  }) => {
    const owner = await client.readContract({
      address: morpho,
      abi: blueAbi,
      functionName: "owner",
    });

    const params = new MarketParams({
      ...eth_wstEth,
      irm: randomAddress(),
    });

    await client.setCode({
      address: params.irm,
      bytecode: (await client.getCode({
        address: adaptiveCurveIrm,
      }))!,
    });

    await client.setBalance({ address: owner, value: BigInt(1e18) });
    await client.writeContract({
      account: owner,
      address: morpho,
      abi: blueAbi,
      functionName: "enableIrm",
      args: [params.irm],
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "createMarket",
      args: [{ ...params }],
    });

    const expectedData = new Market({
      params,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: await client.timestamp(),
      fee: 0n,
      price: 1160095030000000000000000000000000000n,
      rateAtTarget: undefined,
    });

    const value = await Market.fetch(params.id, wallet);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch market with incorrect oracle", async ({
    client,
    wallet,
  }) => {
    const params = new MarketParams({
      ...crvUsd_stkcvx2BTC,
      oracle: randomAddress(),
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "createMarket",
      args: [{ ...params }],
    });

    const expectedData = new Market({
      params,
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 1711597272n,
      fee: 0n,
      rateAtTarget: 1268391679n,
    });

    const value = await Market.fetch(params.id, wallet);

    expect(value).toStrictEqual(expectedData);
  });
});

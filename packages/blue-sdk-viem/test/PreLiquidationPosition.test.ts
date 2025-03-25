import { maxUint256, parseUnits } from "viem";

import {
  ChainId,
  PreLiquidationParams,
  PreLiquidationPosition,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";
import { testAccount } from "@morpho-org/test";
import { describe, expect } from "vitest";
import {
  blueAbi,
  fetchMarket,
  fetchPreLiquidationPosition,
  preLiquidationFactoryAbi,
} from "../src";
import { preLiquidationTest } from "./setup";

const { morpho } = getChainAddresses(ChainId.EthMainnet);
const { usdt_wbtc } = markets[ChainId.EthMainnet];

const supplyAssets = parseUnits("10", 6);
const borrowShares = parseUnits("7", 12);
const collateral = parseUnits("1", 8);

const supplier = testAccount(1);

const preLiquidationParams = new PreLiquidationParams({
  preLltv: 832603694978000000n,
  preLCF1: 200000000000000000n,
  preLCF2: 800000000000000000n,
  preLIF1: 1010000000000000000n,
  preLIF2: 1010000000000000000n,
  preLiquidationOracle: "0x008bF4B1cDA0cc9f0e882E0697f036667652E1ef",
});

const preLiquidationAddress = "0x0341b93dcb3b27fd4e2a6890cf06d67f64d9ac8e";

describe("augment/Position", () => {
  preLiquidationTest("should fetch position", async ({ client }) => {
    await client.deal({
      erc20: usdt_wbtc.loanToken,
      account: supplier.address,
      amount: supplyAssets,
    });
    await client.approve({
      account: supplier,
      address: usdt_wbtc.loanToken,
      args: [morpho, maxUint256],
    });
    await client.writeContract({
      account: supplier,
      address: morpho,
      abi: blueAbi,
      functionName: "supply",
      args: [usdt_wbtc, supplyAssets, 0n, supplier.address, "0x"],
    });

    await client.deal({
      erc20: usdt_wbtc.collateralToken,
      amount: collateral,
    });
    await client.approve({
      address: usdt_wbtc.collateralToken,
      args: [morpho, maxUint256],
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [usdt_wbtc, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "borrow",
      args: [
        { ...usdt_wbtc },
        0n,
        borrowShares,
        client.account.address,
        client.account.address,
      ],
    });

    await client.writeContract({
      address: "0x6FF33615e792E35ed1026ea7cACCf42D9BF83476",
      abi: preLiquidationFactoryAbi,
      functionName: "createPreLiquidation",
      args: [usdt_wbtc.id, { ...preLiquidationParams }],
    });

    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [preLiquidationAddress, true],
    });

    const market = await fetchMarket(usdt_wbtc.id, client);

    const expectedData = new PreLiquidationPosition(
      {
        preLiquidationParams,
        preLiquidation: preLiquidationAddress,
        preLiquidationOraclePrice: market.price,
        user: client.account.address,
        supplyShares: 0n,
        borrowShares,
        collateral,
      },
      market,
    );

    const value = await fetchPreLiquidationPosition(
      client.account.address,
      usdt_wbtc.id,
      preLiquidationAddress,
      client,
    );

    expect(value).toStrictEqual(expectedData);
  });
});

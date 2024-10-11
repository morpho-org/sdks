import { maxUint256, parseUnits } from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";
import { markets } from "@morpho-org/morpho-test";
import { testAccount } from "@morpho-org/test-viem";
import { describe, expect } from "vitest";
import { Position } from "../src/augment/Position.js";
import { blueAbi } from "../src/index.js";
import { test } from "./setup.js";

const { morpho } = addresses[ChainId.EthMainnet];
const { usdc_wstEth } = markets[ChainId.EthMainnet];

const supplyAssets = parseUnits("10", 6);
const borrowShares = parseUnits("7", 12);
const collateral = parseUnits("1", 18);

const supplier = testAccount(1);

describe("augment/Position", () => {
  test("should fetch position", async ({ client }) => {
    await client.deal({
      erc20: usdc_wstEth.loanToken,
      recipient: supplier.address,
      amount: supplyAssets,
    });
    await client.approve({
      account: supplier,
      address: usdc_wstEth.loanToken,
      args: [morpho, maxUint256],
    });
    await client.writeContract({
      account: supplier,
      address: morpho,
      abi: blueAbi,
      functionName: "supply",
      args: [usdc_wstEth, supplyAssets, 0n, supplier.address, "0x"],
    });

    await client.deal({
      erc20: usdc_wstEth.collateralToken,
      recipient: client.account.address,
      amount: collateral,
    });
    await client.approve({
      address: usdc_wstEth.collateralToken,
      args: [morpho, maxUint256],
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [usdc_wstEth, collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "borrow",
      args: [
        { ...usdc_wstEth },
        0n,
        borrowShares,
        client.account.address,
        client.account.address,
      ],
    });

    const expectedData = new Position({
      user: client.account.address,
      marketId: usdc_wstEth.id,
      supplyShares: 0n,
      borrowShares,
      collateral,
    });

    const value = await Position.fetch(
      client.account.address,
      usdc_wstEth.id,
      client,
    );

    expect(value).toStrictEqual(expectedData);
  });
});

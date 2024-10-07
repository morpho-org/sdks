import { zeroAddress } from "viem";

import { ChainId, type MarketId, addresses } from "@morpho-org/blue-sdk";

import { MarketConfig } from "../src/augment/MarketConfig.js";
import { test } from "./setup.js";

import { markets } from "@morpho-org/morpho-test";
import { describe, expect } from "vitest";

const { usdc_wstEth } = markets[ChainId.EthMainnet];

describe("augment/MarketConfig", () => {
  test("should fetch config from cache", async ({ client }) => {
    const market = await MarketConfig.fetch(usdc_wstEth.id, client);

    expect(market).toStrictEqual(usdc_wstEth);
  });

  test("should fetch config from chain", async ({ client }) => {
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

    expect(market).toEqual(marketParams); // Not strict equal because not the same class.
  });
});

import { zeroAddress } from "viem";

import {
  ChainId,
  type MarketId,
  addressesRegistry,
} from "@morpho-org/blue-sdk";

import { MarketParams } from "../../src/augment/MarketParams";
import { test } from "./setup";

import { markets } from "@morpho-org/morpho-test";
import { describe, expect } from "vitest";

const { usdc_wstEth } = markets[ChainId.EthMainnet];

describe("augment/MarketParams", () => {
  test("should fetch config from cache", async ({ wallet }) => {
    const market = await MarketParams.fetch(usdc_wstEth.id, wallet);

    expect(market).toStrictEqual(usdc_wstEth);
  });

  test("should fetch config from chain", async ({ wallet }) => {
    const marketParams = {
      collateralToken: zeroAddress,
      loanToken: addressesRegistry[ChainId.EthMainnet].wNative,
      lltv: 0n,
      irm: zeroAddress,
      oracle: zeroAddress,
      id: "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284",
      liquidationIncentiveFactor: 1150000000000000000n,
    };

    const market = await MarketParams.fetch(
      "0x58e212060645d18eab6d9b2af3d56fbc906a92ff5667385f616f662c70372284" as MarketId,
      wallet,
    );

    expect(market).toEqual(marketParams); // Not strict equal because not the same class.
  });
});

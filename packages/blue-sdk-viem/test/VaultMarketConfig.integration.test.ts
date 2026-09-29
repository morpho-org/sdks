import { ChainId } from "@morpho-org/blue-sdk";
import { markets, vaults } from "@morpho-org/morpho-test";
import { describe, expect } from "vitest";
import { VaultMarketConfig } from "../src/augment/VaultMarketConfig.js";
import { test } from "./setup.js";

const { usdc_wstEth } = markets[ChainId.EthMainnet];
const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("augment/VaultMarketConfig", () => {
  test("should fetch vault market data", async ({ client }) => {
    const expectedData = new VaultMarketConfig({
      vault: steakUsdc.address,
      marketId: usdc_wstEth.id,
      cap: 1000000000000000000000000000000n,
      enabled: true,
      pendingCap: {
        value: 0n,
        validAt: 0n,
      },
      removableAt: 0n,
    });

    const value = await VaultMarketConfig.fetch(
      steakUsdc.address,
      usdc_wstEth.id,
      client,
    );

    expect(value).toStrictEqual(expectedData);
  });
});

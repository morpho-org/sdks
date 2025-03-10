import { describe, expect } from "vitest";
import { test } from "./setup";

import {
  ChainId,
  VaultMarketPublicAllocatorConfig,
  addressesRegistry,
} from "@morpho-org/blue-sdk";

import { markets, vaults } from "@morpho-org/morpho-test";
import { VaultMarketConfig } from "../../src/augment/VaultMarketConfig";
import { metaMorphoAbi, publicAllocatorAbi } from "./abis";

const { usdc_wstEth } = markets[ChainId.EthMainnet];
const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("augment/VaultMarketConfig", () => {
  test("should fetch vault market data", async ({ client, wallet }) => {
    const owner = await client.readContract({
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "owner",
    });

    await client.setBalance({ address: owner, value: BigInt(1e18) });
    await client.writeContract({
      account: owner,
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "setIsAllocator",
      args: [addressesRegistry[ChainId.EthMainnet].publicAllocator, true],
    });
    await client.writeContract({
      account: owner,
      address: addressesRegistry[ChainId.EthMainnet].publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFee",
      args: [steakUsdc.address, 1n],
    });
    await client.writeContract({
      account: owner,
      address: addressesRegistry[ChainId.EthMainnet].publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFlowCaps",
      args: [
        steakUsdc.address,
        [
          {
            id: usdc_wstEth.id,
            caps: { maxIn: 2n, maxOut: 3n },
          },
        ],
      ],
    });

    const expectedData = new VaultMarketConfig({
      vault: steakUsdc.address,
      marketId: usdc_wstEth.id,
      cap: 1000000000000000000000000000000n,
      enabled: true,
      pendingCap: {
        value: 0n,
        validAt: 0n,
      },
      publicAllocatorConfig: new VaultMarketPublicAllocatorConfig({
        vault: steakUsdc.address,
        marketId: usdc_wstEth.id,
        maxIn: 2n,
        maxOut: 3n,
      }),
      removableAt: 0n,
    });

    const value = await VaultMarketConfig.fetch(
      steakUsdc.address,
      usdc_wstEth.id,
      wallet,
    );

    expect(value).toStrictEqual(expectedData);
  });
});

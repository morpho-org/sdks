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
  VaultMarketPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";

import { metaMorphoAbi, publicAllocatorAbi } from "../src/abis";
import { VaultMarketConfig } from "../src/augment/VaultMarketConfig";
import { steakUsdc } from "./fixtures";

describe("augment/VaultMarketConfig", () => {
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

    const owner = await client.readContract({
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "owner",
    });
    await client.impersonateAccount({ address: owner });

    await client.writeContract({
      account: owner,
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "setIsAllocator",
      args: [addresses[ChainId.EthMainnet].publicAllocator, true],
    });

    await client.writeContract({
      account: owner,
      address: addresses[ChainId.EthMainnet].publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFee",
      args: [steakUsdc.address, 1n],
    });

    await client.writeContract({
      account: owner,
      address: addresses[ChainId.EthMainnet].publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFlowCaps",
      args: [
        steakUsdc.address,
        [
          {
            id: MAINNET_MARKETS.usdc_wstEth.id,
            caps: { maxIn: 2n, maxOut: 3n },
          },
        ],
      ],
    });
  });

  it("should fetch vault market data", async () => {
    const expectedData = new VaultMarketConfig({
      vault: steakUsdc.address,
      marketId: MAINNET_MARKETS.usdc_wstEth.id,
      cap: 1000000000000000000000000000000n,
      enabled: true,
      pendingCap: {
        value: 0n,
        validAt: 0n,
      },
      publicAllocatorConfig: new VaultMarketPublicAllocatorConfig({
        vault: steakUsdc.address,
        marketId: MAINNET_MARKETS.usdc_wstEth.id,
        maxIn: 2n,
        maxOut: 3n,
      }),
      removableAt: 0n,
    });

    const value = await VaultMarketConfig.fetch(
      steakUsdc.address,
      MAINNET_MARKETS.usdc_wstEth.id,
      client,
    );

    expect(value).to.eql(expectedData);
  });
});

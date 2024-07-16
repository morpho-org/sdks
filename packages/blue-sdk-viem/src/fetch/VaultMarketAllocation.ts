import {
  Account,
  Address,
  Chain,
  ParseAccount,
  PublicClient,
  RpcSchema,
  Transport,
} from "viem";

import {
  AccrualPosition,
  ChainId,
  ChainUtils,
  MarketId,
  VaultMarketAllocation,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";

import "./Position";
import "./VaultMarketConfig";
import { ViewOverrides } from "../types";

export async function fetchVaultMarketAllocation<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  vault: Address,
  marketId: MarketId,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  const config = await VaultMarketConfig.fetch(
    vault,
    marketId,
    client,
    options,
  );

  return VaultMarketAllocation.fetchFromConfig(
    config,
    marketId,
    client,
    options,
  );
}

export async function fetchVaultMarketAllocationFromConfig<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  config: VaultMarketConfig,
  marketId: MarketId,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  return new VaultMarketAllocation({
    config,
    position: await AccrualPosition.fetch(
      config.vault as Address,
      marketId,
      client,
      options,
    ),
  });
}

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
    let fetchFromConfig: typeof fetchVaultMarketAllocationFromConfig;
  }
}

VaultMarketAllocation.fetch = fetchVaultMarketAllocation;
VaultMarketAllocation.fetchFromConfig = fetchVaultMarketAllocationFromConfig;

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
  ChainId,
  ChainUtils,
  MarketId,
  VaultMarketAllocation,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";

import { ViewOverrides } from "../types";
import { fetchAccrualPosition } from "./Position";
import { fetchVaultMarketConfig } from "./VaultMarketConfig";

export async function fetchVaultMarketAllocation<
  transport extends Transport,
  chain extends Chain | undefined,
  account extends Account | undefined,
  rpcSchema extends RpcSchema | undefined,
>(
  vault: Address,
  marketId: MarketId,
  client: PublicClient<transport, chain, ParseAccount<account>, rpcSchema>,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  const config = await fetchVaultMarketConfig(vault, marketId, client, options);

  return fetchVaultMarketAllocationFromConfig(
    config,
    marketId,
    client,
    options,
  );
}

export async function fetchVaultMarketAllocationFromConfig<
  transport extends Transport,
  chain extends Chain | undefined,
  account extends Account | undefined,
  rpcSchema extends RpcSchema | undefined,
>(
  config: VaultMarketConfig,
  marketId: MarketId,
  client: PublicClient<transport, chain, ParseAccount<account>, rpcSchema>,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  return new VaultMarketAllocation({
    config,
    position: await fetchAccrualPosition(
      config.vault as Address,
      marketId,
      client,
      options,
    ),
  });
}

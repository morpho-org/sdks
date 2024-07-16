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
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";

import "./VaultMarketPublicAllocatorConfig";
import { metaMorphoAbi } from "../abis";
import { ViewOverrides } from "../types";

export async function fetchVaultMarketConfig<
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

  const [[cap, enabled, removableAt], pendingCap, publicAllocatorConfig] =
    await Promise.all([
      client.readContract({
        ...options.overrides,
        address: vault,
        abi: metaMorphoAbi,
        functionName: "config",
        args: [marketId],
      }),
      client
        .readContract({
          ...options.overrides,
          address: vault,
          abi: metaMorphoAbi,
          functionName: "pendingCap",
          args: [marketId],
        })
        .then(([value, validAt]) => ({ value, validAt })),
      VaultMarketPublicAllocatorConfig.fetch(vault, marketId, client, options),
    ]);

  return new VaultMarketConfig({
    vault,
    marketId,
    cap,
    pendingCap,
    enabled,
    removableAt,
    publicAllocatorConfig,
  });
}

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketConfig {
    let fetch: typeof fetchVaultMarketConfig;
  }
}

VaultMarketConfig.fetch = fetchVaultMarketConfig;

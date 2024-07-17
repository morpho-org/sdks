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
} from "@morpho-org/blue-sdk";

import { metaMorphoAbi } from "../abis";
import { ViewOverrides } from "../types";
import { fetchVaultMarketPublicAllocatorConfig } from "./VaultMarketPublicAllocatorConfig";

export async function fetchVaultMarketConfig<
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
      fetchVaultMarketPublicAllocatorConfig(vault, marketId, client, options),
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

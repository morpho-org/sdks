import { Address, Client } from "viem";

import {
  ChainId,
  ChainUtils,
  MarketId,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis";
import { ViewOverrides } from "../types";
import { fetchVaultMarketPublicAllocatorConfig } from "./VaultMarketPublicAllocatorConfig";

export async function fetchVaultMarketConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  const [[cap, enabled, removableAt], pendingCap, publicAllocatorConfig] =
    await Promise.all([
      readContract(client, {
        ...options.overrides,
        address: vault,
        abi: metaMorphoAbi,
        functionName: "config",
        args: [marketId],
      }),
      readContract(client, {
        ...options.overrides,
        address: vault,
        abi: metaMorphoAbi,
        functionName: "pendingCap",
        args: [marketId],
      }).then(([value, validAt]) => ({ value, validAt })),
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

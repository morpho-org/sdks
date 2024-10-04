import type { Address, Client } from "viem";

import {
  ChainUtils,
  type MarketId,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";
import { fetchVaultMarketPublicAllocatorConfig } from "./VaultMarketPublicAllocatorConfig.js";

export async function fetchVaultMarketConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const [[cap, enabled, removableAt], pendingCap, publicAllocatorConfig] =
    await Promise.all([
      readContract(client, {
        ...parameters,
        address: vault,
        abi: metaMorphoAbi,
        functionName: "config",
        args: [marketId],
      }),
      readContract(client, {
        ...parameters,
        address: vault,
        abi: metaMorphoAbi,
        functionName: "pendingCap",
        args: [marketId],
      }).then(([value, validAt]) => ({ value, validAt })),
      fetchVaultMarketPublicAllocatorConfig(
        vault,
        marketId,
        client,
        parameters,
      ),
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

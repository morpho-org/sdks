import type { Address, Client } from "viem";

import {
  ChainUtils,
  type MarketId,
  VaultMarketPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { publicAllocatorAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";

export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const { publicAllocator } = addresses[parameters.chainId];

  const [maxIn, maxOut] = await readContract(client, {
    ...parameters,
    address: publicAllocator,
    abi: publicAllocatorAbi,
    functionName: "flowCaps",
    args: [vault, marketId],
  });

  return new VaultMarketPublicAllocatorConfig({
    vault,
    marketId,
    maxIn,
    maxOut,
  });
}

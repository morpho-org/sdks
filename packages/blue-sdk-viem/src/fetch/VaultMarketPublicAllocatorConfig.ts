import { Address, Client } from "viem";

import {
  ChainUtils,
  MarketId,
  VaultMarketPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { publicAllocatorAbi } from "../abis";
import { FetchOptions } from "../types";

export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { publicAllocator } = addresses[chainId];

  if (!publicAllocator) return;

  const [maxIn, maxOut] = await readContract(client, {
    ...overrides,
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

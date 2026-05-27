import {
  getChainAddresses,
  type MarketId,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { publicAllocatorAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";

// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  /* v8 ignore next -- V8 reports this covered chain-address lookup as uncovered. */
  const { publicAllocator } = getChainAddresses(parameters.chainId);
  /* v8 ignore next -- V8 reports this covered optional-public-allocator branch with a negative counter. */
  if (publicAllocator == null) return;

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

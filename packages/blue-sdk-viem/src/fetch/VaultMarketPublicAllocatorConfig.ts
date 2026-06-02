import {
  getChainAddresses,
  type MarketId,
  VaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { publicAllocatorAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";

/**
 * Fetches PublicAllocator flow caps for a vault market.
 *
 * Reads `PublicAllocator.flowCaps(vault, marketId)` when the configured chain has a
 * PublicAllocator deployment.
 *
 * @param vault - MetaMorpho vault address.
 * @param marketId - Market id whose flow caps are fetched.
 * @param client - Viem client used for the contract read.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `VaultMarketPublicAllocatorConfig`, or `undefined` when the chain has no
 *   PublicAllocator deployment.
 * @example
 * ```ts
 * import type { MarketId, VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const config: VaultMarketPublicAllocatorConfig | undefined =
 *   await fetchVaultMarketPublicAllocatorConfig(vault, marketId, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultMarketPublicAllocatorConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { publicAllocator } = getChainAddresses(parameters.chainId);
  /* v8 ignore next: V8 does not credit this guard's empty false branch; both paths are tested. */
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

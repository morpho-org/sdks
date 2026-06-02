import { type MarketId, VaultMarketConfig } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi } from "../abis.js";
import type { FetchParameters } from "../types.js";
import { fetchVaultMarketPublicAllocatorConfig } from "./VaultMarketPublicAllocatorConfig.js";

/**
 * Fetches a MetaMorpho vault market configuration.
 *
 * Reads `config(marketId)`, `pendingCap(marketId)`, and public allocator flow caps when the chain
 * has a PublicAllocator deployment.
 *
 * @param vault - MetaMorpho vault address.
 * @param marketId - Market id whose vault config is fetched.
 * @param client - Viem client used for the contract reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `VaultMarketConfig` entity.
 * @example
 * ```ts
 * import type { MarketId, VaultMarketConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultMarketConfig } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const config: VaultMarketConfig = await fetchVaultMarketConfig(
 *   vault,
 *   marketId,
 *   client,
 * );
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultMarketConfig(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

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

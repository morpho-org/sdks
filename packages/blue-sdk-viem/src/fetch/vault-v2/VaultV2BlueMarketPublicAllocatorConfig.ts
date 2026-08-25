import {
  getChainAddress,
  VaultV2BlueMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address, Client, Hash } from "viem";
import { getChainId, readContract } from "viem/actions";
import { vaultV2BluePublicAllocatorAbi } from "../../abis.js";
import type { FetchParameters } from "../../types.js";

/**
 * Fetches BluePublicAllocator permission and cap state for one Vault V2 adapter-market pair.
 *
 * @param vault - Vault V2 address.
 * @param adapter - MorphoMarketV1AdapterV2 address.
 * @param adapterMarketCapId - Adapter-scoped market cap id.
 * @param client - Viem client used for contract reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns Hydrated adapter-market config with max-in calculation.
 * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {viem.BaseError} when one of the contract reads fails.
 * @example
 * ```ts
 * import type { VaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
 * import { type Address, createPublicClient, type Hash, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * export async function fetchMarketAllocatorConfig(
 *   vault: Address,
 *   adapter: Address,
 *   adapterMarketCapId: Hash,
 * ): Promise<VaultV2BlueMarketPublicAllocatorConfig> {
 *   return fetchVaultV2BlueMarketPublicAllocatorConfig(
 *     vault,
 *     adapter,
 *     adapterMarketCapId,
 *     client,
 *   );
 * }
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: follows the package's vault/adapter/id/client/options fetcher convention
export async function fetchVaultV2BlueMarketPublicAllocatorConfig(
  vault: Address,
  adapter: Address,
  adapterMarketCapId: Hash,
  client: Client,
  parameters: FetchParameters = {},
): Promise<VaultV2BlueMarketPublicAllocatorConfig> {
  const chainId = parameters.chainId ?? (await getChainId(client));
  const allocator = getChainAddress(chainId, "vaultV2BluePublicAllocator");
  const [absoluteCap, canPullFromMarket] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "absoluteCap",
      args: [vault, adapterMarketCapId],
    }),
    readContract(client, {
      ...parameters,
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "canPullFromMarket",
      args: [vault, adapterMarketCapId],
    }),
  ]);

  return new VaultV2BlueMarketPublicAllocatorConfig({
    vault,
    adapter,
    adapterMarketCapId,
    absoluteCap,
    canPullFromMarket,
  });
}

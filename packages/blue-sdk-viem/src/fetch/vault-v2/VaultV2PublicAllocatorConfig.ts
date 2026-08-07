import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  type IVaultV2Allocation,
  type VaultV2MarketPublicAllocatorConfig,
  type VaultV2PublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address, Client, Hash } from "viem";
import { readContract } from "viem/actions";
import { vaultV2Abi, vaultV2BluePublicAllocatorAbi } from "../../abis.js";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2PublicAllocatorConfig.js";
import type {
  DeploylessFetchParameters,
  FetchParameters,
} from "../../types.js";

/**
 * Fetches a Vault V2's BluePublicAllocator-wide configuration.
 *
 * @param allocator - Explicit BluePublicAllocator contract address.
 * @param vault - Vault V2 address.
 * @param client - Viem client used for the contract read.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @returns The vault's idle-allocation permission and per-call native penalty.
 * @example
 * ```ts
 * import { fetchVaultV2PublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
 *
 * const config = await fetchVaultV2PublicAllocatorConfig(allocator, vault, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: identity fields mirror the allocator's mapping keys
export async function fetchVaultV2PublicAllocatorConfig(
  allocator: Address,
  vault: Address,
  client: Client,
  parameters: FetchParameters = {},
): Promise<VaultV2PublicAllocatorConfig> {
  const [canAllocateFromIdle, nativePenalty] = await readContract(client, {
    ...parameters,
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "vaultData",
    args: [vault],
  });

  return {
    allocator,
    vault,
    canAllocateFromIdle,
    nativePenalty,
  };
}

/**
 * Fetches BluePublicAllocator permissions and cap state for one Vault V2 adapter-market pair.
 *
 * @param allocator - Explicit BluePublicAllocator contract address.
 * @param vault - Vault V2 address.
 * @param adapter - MorphoMarketV1AdapterV2 address.
 * @param marketParamsId - Adapter-scoped market-parameters id.
 * @param client - Viem client used for contract reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @returns The allocator cap and permissions for the adapter-market pair.
 * @example
 * ```ts
 * import { fetchVaultV2MarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
 *
 * const config = await fetchVaultV2MarketPublicAllocatorConfig(
 *   allocator,
 *   vault,
 *   adapter,
 *   marketParamsId,
 *   client,
 * );
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: identity fields mirror the allocator's mapping keys
export async function fetchVaultV2MarketPublicAllocatorConfig(
  allocator: Address,
  vault: Address,
  adapter: Address,
  marketParamsId: Hash,
  client: Client,
  parameters: FetchParameters = {},
): Promise<VaultV2MarketPublicAllocatorConfig> {
  const [absoluteCap, canDeallocate, isActiveAdapter] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "absoluteCap",
      args: [vault, marketParamsId],
    }),
    readContract(client, {
      ...parameters,
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "canDeallocate",
      args: [vault, marketParamsId],
    }),
    readContract(client, {
      ...parameters,
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "isActiveAdapter",
      args: [vault, adapter],
    }),
  ]);

  return {
    allocator,
    vault,
    adapter,
    marketParamsId,
    absoluteCap,
    canDeallocate,
    isActiveAdapter,
  };
}

/**
 * Fetches all BluePublicAllocator and Vault V2 cap data needed to simulate
 * reallocations for one hydrated Vault V2.
 *
 * Only `VaultV2MorphoMarketV1AdapterV2` adapters participate. The function
 * derives every adapter-market id and shared vault allocation id from the
 * hydrated vault, uses one deployless `eth_call` by default, and falls back to
 * direct reads unless deployless mode is forced.
 *
 * @param allocator - Explicit BluePublicAllocator contract address.
 * @param vault - Hydrated Vault V2 whose accrued adapters provide the candidate markets.
 * @param client - Viem client used for deployless or direct reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.deployless - Deployless mode; defaults to `true`, with direct-read fallback.
 * @returns Vault-wide config, adapter-market configs keyed by `marketParamsId`, and allocations keyed by derived id.
 * @example
 * ```ts
 * import { fetchVaultV2PublicAllocatorData } from "@morpho-org/blue-sdk-viem";
 *
 * const data = await fetchVaultV2PublicAllocatorData(allocator, vault, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: follows the package's address/entity/client/options fetcher convention
export async function fetchVaultV2PublicAllocatorData(
  allocator: Address,
  vault: AccrualVaultV2,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const marketRequests: {
    readonly adapter: Address;
    readonly marketParamsId: Hash;
  }[] = [];
  const allocationIds = new Set<Hash>();

  for (const adapter of vault.accrualAdapters) {
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) continue;

    for (const market of adapter.markets) {
      const ids = adapter.ids(market.params);
      marketRequests.push({
        adapter: adapter.address,
        marketParamsId: ids[2],
      });
      for (const id of ids) allocationIds.add(id);
    }
  }

  const allocationIdList = [...allocationIds];

  if (deployless) {
    try {
      const result = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [allocator, vault.address, marketRequests, allocationIdList],
      });

      const marketPublicAllocatorConfigs: Record<
        Hash,
        VaultV2MarketPublicAllocatorConfig | undefined
      > = {};
      for (const config of result.marketConfigs) {
        marketPublicAllocatorConfigs[config.marketParamsId] = {
          allocator,
          vault: vault.address,
          ...config,
        };
      }

      const allocations: Record<Hash, IVaultV2Allocation | undefined> = {};
      for (const allocation of result.allocations) {
        allocations[allocation.id] = allocation;
      }

      return {
        publicAllocatorConfig: {
          allocator,
          vault: vault.address,
          canAllocateFromIdle: result.canAllocateFromIdle,
          nativePenalty: result.nativePenalty,
        } satisfies VaultV2PublicAllocatorConfig,
        marketPublicAllocatorConfigs,
        allocations,
      };
    } catch (error) {
      if (deployless === "force") throw error;
      // Fall back to direct reads when deployless execution is unavailable.
    }
  }

  const [publicAllocatorConfig, marketConfigs, allocationValues] =
    await Promise.all([
      fetchVaultV2PublicAllocatorConfig(
        allocator,
        vault.address,
        client,
        parameters,
      ),
      Promise.all(
        marketRequests.map(({ adapter, marketParamsId }) =>
          fetchVaultV2MarketPublicAllocatorConfig(
            allocator,
            vault.address,
            adapter,
            marketParamsId,
            client,
            parameters,
          ),
        ),
      ),
      Promise.all(
        allocationIdList.map(async (id) => {
          const [absoluteCap, relativeCap, allocation] = await Promise.all([
            readContract(client, {
              ...parameters,
              address: vault.address,
              abi: vaultV2Abi,
              functionName: "absoluteCap",
              args: [id],
            }),
            readContract(client, {
              ...parameters,
              address: vault.address,
              abi: vaultV2Abi,
              functionName: "relativeCap",
              args: [id],
            }),
            readContract(client, {
              ...parameters,
              address: vault.address,
              abi: vaultV2Abi,
              functionName: "allocation",
              args: [id],
            }),
          ]);

          return { id, absoluteCap, relativeCap, allocation };
        }),
      ),
    ]);

  const marketPublicAllocatorConfigs: Record<
    Hash,
    VaultV2MarketPublicAllocatorConfig | undefined
  > = {};
  for (const config of marketConfigs) {
    marketPublicAllocatorConfigs[config.marketParamsId] = config;
  }

  const allocations: Record<Hash, IVaultV2Allocation | undefined> = {};
  for (const allocation of allocationValues) {
    allocations[allocation.id] = allocation;
  }

  return {
    publicAllocatorConfig,
    marketPublicAllocatorConfigs,
    allocations,
  };
}

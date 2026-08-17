import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddress,
  type IVaultV2Allocation,
  type VaultV2MarketPublicAllocatorConfig,
  type VaultV2PublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import type { Address, Client, Hash } from "viem";
import { getChainId, readContract } from "viem/actions";
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
 * @param vault - Vault V2 address.
 * @param client - Viem client used for the contract read.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The vault's idle-pull permission and WAD-scaled vault-asset penalty.
 * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {viem.BaseError} when the contract read fails.
 * @example
 * ```ts
 * import type { VaultV2PublicAllocatorConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2PublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
 * import { type Address, createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * export async function fetchAllocatorConfig(
 *   vault: Address,
 * ): Promise<VaultV2PublicAllocatorConfig> {
 *   return fetchVaultV2PublicAllocatorConfig(vault, client);
 * }
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: follows the package's address/client/options fetcher convention
export async function fetchVaultV2PublicAllocatorConfig(
  vault: Address,
  client: Client,
  parameters: FetchParameters = {},
): Promise<VaultV2PublicAllocatorConfig> {
  const chainId = parameters.chainId ?? (await getChainId(client));
  const allocator = getChainAddress(chainId, "bluePublicAllocator");
  const [canPullFromIdle, penalty] = await readContract(client, {
    ...parameters,
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "vaultData",
    args: [vault],
  });

  return {
    vault,
    canPullFromIdle,
    penalty,
  };
}

/**
 * Fetches BluePublicAllocator permission and cap state for one Vault V2 adapter-market pair.
 *
 * @param vault - Vault V2 address.
 * @param adapter - MorphoMarketV1AdapterV2 address.
 * @param marketParamsId - Adapter-scoped market-parameters id.
 * @param client - Viem client used for contract reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The allocator cap and pull permission for the adapter-market pair.
 * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {viem.BaseError} when one of the contract reads fails.
 * @example
 * ```ts
 * import type { VaultV2MarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2MarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
 * import { type Address, createPublicClient, type Hash, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * export async function fetchMarketAllocatorConfig(
 *   vault: Address,
 *   adapter: Address,
 *   marketParamsId: Hash,
 * ): Promise<VaultV2MarketPublicAllocatorConfig> {
 *   return fetchVaultV2MarketPublicAllocatorConfig(
 *     vault,
 *     adapter,
 *     marketParamsId,
 *     client,
 *   );
 * }
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: follows the package's vault/adapter/id/client/options fetcher convention
export async function fetchVaultV2MarketPublicAllocatorConfig(
  vault: Address,
  adapter: Address,
  marketParamsId: Hash,
  client: Client,
  parameters: FetchParameters = {},
): Promise<VaultV2MarketPublicAllocatorConfig> {
  const chainId = parameters.chainId ?? (await getChainId(client));
  const allocator = getChainAddress(chainId, "bluePublicAllocator");
  const [absoluteCap, canPullFromMarket] = await Promise.all([
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
      functionName: "canPullFromMarket",
      args: [vault, marketParamsId],
    }),
  ]);

  return {
    vault,
    adapter,
    marketParamsId,
    absoluteCap,
    canPullFromMarket,
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
 * @param vault - Hydrated Vault V2 whose accrued adapters provide the candidate markets.
 * @param client - Viem client used for deployless or direct reads.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Deployless mode; defaults to `true`, with direct-read fallback.
 * @returns Vault-wide config, active-adapter set, adapter-market configs keyed by `marketParamsId`, and allocations keyed by derived id.
 * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {viem.BaseError} when deployless mode is forced and fails, or when a direct contract read fails.
 * @example
 * ```ts
 * import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2PublicAllocatorData } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * export async function fetchAllocatorData(
 *   vault: AccrualVaultV2,
 * ) {
 *   const data = await fetchVaultV2PublicAllocatorData(vault, client);
 *   // data contains publicAllocatorConfig, activeAdapters, marketPublicAllocatorConfigs, and allocations.
 *   return data;
 * }
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: follows the package's entity/client/options fetcher convention
export async function fetchVaultV2PublicAllocatorData(
  vault: AccrualVaultV2,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  const allocator = getChainAddress(chainId, "bluePublicAllocator");
  const marketRequests: {
    readonly adapter: Address;
    readonly marketParamsId: Hash;
  }[] = [];
  const adapters = new Set<Address>();
  const allocationIds = new Set<Hash>();

  for (const adapter of vault.accrualAdapters) {
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) continue;
    adapters.add(adapter.address);

    for (const market of adapter.markets) {
      const ids = adapter.ids(market.params);
      marketRequests.push({
        adapter: adapter.address,
        marketParamsId: ids[2],
      });
      for (const id of ids) allocationIds.add(id);
    }
  }

  const adapterList = [...adapters];
  const allocationIdList = [...allocationIds];

  if (deployless) {
    try {
      const result = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [
          allocator,
          vault.address,
          adapterList,
          marketRequests,
          allocationIdList,
        ],
      });

      const marketPublicAllocatorConfigs: Record<
        Hash,
        VaultV2MarketPublicAllocatorConfig | undefined
      > = {};
      for (const config of result.marketConfigs) {
        marketPublicAllocatorConfigs[config.marketParamsId] = {
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
          vault: vault.address,
          canPullFromIdle: result.canPullFromIdle,
          penalty: result.penalty,
        } satisfies VaultV2PublicAllocatorConfig,
        activeAdapters: new Set(
          adapterList.filter((_, index) => result.isActiveAdapters[index]),
        ),
        marketPublicAllocatorConfigs,
        allocations,
      };
    } catch (error) {
      if (deployless === "force") throw error;
      // Fall back to direct reads when deployless execution is unavailable.
    }
  }

  const [
    publicAllocatorConfig,
    isActiveAdapters,
    marketConfigs,
    allocationValues,
  ] = await Promise.all([
    fetchVaultV2PublicAllocatorConfig(vault.address, client, {
      ...parameters,
      chainId,
    }),
    Promise.all(
      adapterList.map((adapter) =>
        readContract(client, {
          ...parameters,
          address: allocator,
          abi: vaultV2BluePublicAllocatorAbi,
          functionName: "isActiveAdapter",
          args: [vault.address, adapter],
        }),
      ),
    ),
    Promise.all(
      marketRequests.map(({ adapter, marketParamsId }) =>
        fetchVaultV2MarketPublicAllocatorConfig(
          vault.address,
          adapter,
          marketParamsId,
          client,
          { ...parameters, chainId },
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
    activeAdapters: new Set(
      adapterList.filter((_, index) => isActiveAdapters[index]),
    ),
    marketPublicAllocatorConfigs,
    allocations,
  };
}

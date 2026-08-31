import {
  getChainAddresses,
  UnsupportedVaultV2AdapterError,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterFactoryAbi,
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterFactoryAbi,
} from "../../abis.js";
import type { DeploylessFetchParameters } from "../../types.js";
import {
  fetchAccrualVaultV2MorphoMarketV1Adapter,
  fetchVaultV2MorphoMarketV1Adapter,
} from "./VaultV2MorphoMarketV1Adapter.js";
import {
  fetchAccrualVaultV2MorphoMarketV1AdapterV2,
  fetchVaultV2MorphoMarketV1AdapterV2,
} from "./VaultV2MorphoMarketV1AdapterV2.js";
import {
  fetchAccrualVaultV2MorphoVaultV1Adapter,
  fetchVaultV2MorphoVaultV1Adapter,
} from "./VaultV2MorphoVaultV1Adapter.js";

/**
 * Fetches a VaultV2 adapter by detecting its adapter factory type.
 *
 * Reads the configured MorphoVaultV1Adapter, MorphoMarketV1Adapter, and
 * MorphoMarketV1AdapterV2 factories, then delegates to the matching adapter fetcher.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated supported VaultV2 adapter entity.
 * @throws {UnsupportedVaultV2AdapterError} when `address` is not a supported adapter type.
 * @example
 * ```ts
 * import type { IVaultV2Adapter } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2Adapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: IVaultV2Adapter = await fetchVaultV2Adapter(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultV2Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);
  parameters.deployless ??= true;

  const {
    morphoVaultV1AdapterFactory,
    morphoMarketV1AdapterFactory,
    morphoMarketV1AdapterV2Factory,
  } = getChainAddresses(parameters.chainId);

  const [
    isMorphoVaultV1Adapter,
    isMorphoMarketV1Adapter,
    isMorphoMarketV1AdapterV2,
  ] = await Promise.all([
    morphoVaultV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        })
          // Factory may not have been deployed at requested block tag.
          .catch(() => false)
      : false,
    morphoMarketV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterFactory,
          abi: morphoMarketV1AdapterFactoryAbi,
          functionName: "isMorphoMarketV1Adapter",
          args: [address],
        })
          // Factory may not have been deployed at requested block tag.
          .catch(() => false)
      : false,
    morphoMarketV1AdapterV2Factory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterV2Factory,
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [address],
        })
          // Factory may not have been deployed at requested block tag.
          .catch(() => false)
      : false,
  ]);

  if (isMorphoVaultV1Adapter)
    return fetchVaultV2MorphoVaultV1Adapter(address, client, parameters);

  if (isMorphoMarketV1Adapter)
    return fetchVaultV2MorphoMarketV1Adapter(address, client, parameters);

  if (isMorphoMarketV1AdapterV2)
    return fetchVaultV2MorphoMarketV1AdapterV2(address, client, parameters);

  throw new UnsupportedVaultV2AdapterError(address);
}

/**
 * Fetches a VaultV2 adapter with the accrued state required for allocation calculations.
 *
 * Reads the configured adapter factories, then delegates to the matching accrual adapter fetcher.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated supported VaultV2 accrual adapter entity.
 * @throws {UnsupportedVaultV2AdapterError} when `address` is not a supported adapter type.
 * @example
 * ```ts
 * import type { IAccrualVaultV2Adapter } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVaultV2Adapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: IAccrualVaultV2Adapter = await fetchAccrualVaultV2Adapter(
 *   adapterAddress,
 *   client,
 * );
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualVaultV2Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);
  parameters.deployless ??= true;

  const {
    morphoVaultV1AdapterFactory,
    morphoMarketV1AdapterFactory,
    morphoMarketV1AdapterV2Factory,
  } = getChainAddresses(parameters.chainId);

  const [
    isMorphoVaultV1Adapter,
    isMorphoMarketV1Adapter,
    isMorphoMarketV1AdapterV2,
  ] = await Promise.all([
    morphoVaultV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        })
          // Factory may not have been deployed at requested block tag.
          .catch(() => false)
      : false,
    morphoMarketV1AdapterFactory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterFactory,
          abi: morphoMarketV1AdapterFactoryAbi,
          functionName: "isMorphoMarketV1Adapter",
          args: [address],
        })
          // Factory may not have been deployed at requested block tag.
          .catch(() => false)
      : false,
    morphoMarketV1AdapterV2Factory
      ? readContract(client, {
          ...parameters,
          address: morphoMarketV1AdapterV2Factory,
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [address],
        })
          // Factory may not have been deployed at requested block tag.
          .catch(() => false)
      : false,
  ]);

  if (isMorphoVaultV1Adapter)
    return fetchAccrualVaultV2MorphoVaultV1Adapter(address, client, parameters);

  if (isMorphoMarketV1Adapter)
    return fetchAccrualVaultV2MorphoMarketV1Adapter(
      address,
      client,
      parameters,
    );

  if (isMorphoMarketV1AdapterV2)
    return fetchAccrualVaultV2MorphoMarketV1AdapterV2(
      address,
      client,
      parameters,
    );

  throw new UnsupportedVaultV2AdapterError(address);
}

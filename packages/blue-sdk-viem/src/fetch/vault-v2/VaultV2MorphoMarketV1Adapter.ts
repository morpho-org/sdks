import {
  AccrualVaultV2MorphoMarketV1Adapter,
  getChainAddresses,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MorphoMarketV1Adapter,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterAbi,
  morphoMarketV1AdapterFactoryAbi,
} from "../../abis.js";
import { isUnknownOfFactoryError } from "../../error.js";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoMarketV1Adapter.js";
import type { DeploylessFetchParameters } from "../../types.js";
import { readContractRestructured } from "../../utils.js";
import { fetchAccrualPosition } from "../Position.js";

/**
 * Fetches a MorphoMarketV1Adapter used by VaultV2.
 *
 * Uses the deployless adapter query by default and falls back to factory validation plus adapter
 * state reads when allowed.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `VaultV2MorphoMarketV1Adapter` entity.
 * @throws {UnknownFactory} when the configured chain has no MorphoMarketV1Adapter factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory.
 * @example
 * ```ts
 * import type { VaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: VaultV2MorphoMarketV1Adapter =
 *   await fetchVaultV2MorphoMarketV1Adapter(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultV2MorphoMarketV1Adapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morphoMarketV1AdapterFactory } = getChainAddresses(
    parameters.chainId,
  );

  /* v8 ignore next: V8 does not credit this guard's empty false branch; both paths are tested. */
  if (!morphoMarketV1AdapterFactory) {
    throw new UnknownFactory();
  }

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, morphoMarketV1AdapterFactory],
      });

      return new VaultV2MorphoMarketV1Adapter({
        ...adapter,
        marketParamsList: [...adapter.marketParamsList],
        address,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      if (isUnknownOfFactoryError(error)) throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [
    isMorphoMarketV1Adapter,
    parentVault,
    skimRecipient,
    marketParamsListLength,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morphoMarketV1AdapterFactory,
      abi: morphoMarketV1AdapterFactoryAbi,
      functionName: "isMorphoMarketV1Adapter",
      args: [address],
    }) // Factory may not have been deployed at requested block tag.
      .catch(() => false),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterAbi,
      functionName: "parentVault",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterAbi,
      functionName: "skimRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: morphoMarketV1AdapterAbi,
      functionName: "marketParamsListLength",
    }),
  ]);

  if (!isMorphoMarketV1Adapter) {
    throw new UnknownOfFactory(morphoMarketV1AdapterFactory, address);
  }

  const marketParamsList = await Promise.all(
    Array.from({ length: Number(marketParamsListLength) }, (_, i) =>
      readContractRestructured(client, {
        ...parameters,
        address,
        abi: morphoMarketV1AdapterAbi,
        functionName: "marketParamsList",
        args: [BigInt(i)],
      }),
    ),
  );

  return new VaultV2MorphoMarketV1Adapter({
    parentVault,
    skimRecipient,
    address,
    marketParamsList,
  });
}

/**
 * Fetches a MorphoMarketV1Adapter with accrued market positions.
 *
 * Reads the adapter state, then fetches an accrued position for each market params entry.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to downstream fetchers.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `AccrualVaultV2MorphoMarketV1Adapter` entity.
 * @throws {UnknownFactory} when the configured chain has no MorphoMarketV1Adapter factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory.
 * @example
 * ```ts
 * import type { AccrualVaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: AccrualVaultV2MorphoMarketV1Adapter =
 *   await fetchAccrualVaultV2MorphoMarketV1Adapter(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualVaultV2MorphoMarketV1Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  const adapter = await fetchVaultV2MorphoMarketV1Adapter(
    address,
    client,
    parameters,
  );
  const positions = await Promise.all(
    adapter.marketParamsList.map((params) =>
      fetchAccrualPosition(address, params.id, client, parameters),
    ),
  );

  return new AccrualVaultV2MorphoMarketV1Adapter(adapter, positions);
}

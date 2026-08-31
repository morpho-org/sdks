import {
  AccrualVaultV2MorphoVaultV1Adapter,
  getChainAddresses,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import { type Address, type Client, erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoVaultV1AdapterAbi,
  morphoVaultV1AdapterFactoryAbi,
} from "../../abis.js";
import { isUnknownOfFactoryError } from "../../error.js";
import {
  abi,
  code,
} from "../../queries/vault-v2/GetVaultV2MorphoVaultV1Adapter.js";
import type { DeploylessFetchParameters } from "../../types.js";
import { fetchAccrualVault } from "../Vault.js";

/**
 * Fetches a MorphoVaultV1Adapter used by VaultV2.
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
 * @returns The hydrated `VaultV2MorphoVaultV1Adapter` entity.
 * @throws {UnknownFactory} when the configured chain has no MorphoVaultV1Adapter factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory.
 * @example
 * ```ts
 * import type { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: VaultV2MorphoVaultV1Adapter =
 *   await fetchVaultV2MorphoVaultV1Adapter(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultV2MorphoVaultV1Adapter(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morphoVaultV1AdapterFactory } = getChainAddresses(parameters.chainId);

  /* v8 ignore next: V8 does not credit this guard's empty false branch; both paths are tested. */
  if (!morphoVaultV1AdapterFactory) {
    throw new UnknownFactory();
  }

  if (deployless) {
    try {
      const adapter = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, morphoVaultV1AdapterFactory],
      });

      return new VaultV2MorphoVaultV1Adapter({ ...adapter, address });
    } catch (error) {
      if (deployless === "force") throw error;
      if (isUnknownOfFactoryError(error)) throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [isMorphoVaultV1Adapter, parentVault, skimRecipient, morphoVaultV1] =
    await Promise.all([
      readContract(client, {
        ...parameters,
        address: morphoVaultV1AdapterFactory,
        abi: morphoVaultV1AdapterFactoryAbi,
        functionName: "isMorphoVaultV1Adapter",
        args: [address],
      }) // Factory may not have been deployed at requested block tag.
        .catch(() => false),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "parentVault",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "skimRecipient",
      }),
      readContract(client, {
        ...parameters,
        address,
        abi: morphoVaultV1AdapterAbi,
        functionName: "morphoVaultV1",
      }),
    ]);

  if (!isMorphoVaultV1Adapter) {
    throw new UnknownOfFactory(morphoVaultV1AdapterFactory, address);
  }

  return new VaultV2MorphoVaultV1Adapter({
    morphoVaultV1,
    parentVault,
    skimRecipient,
    address,
  });
}

/**
 * Fetches a MorphoVaultV1Adapter with accrued parent vault state and adapter shares.
 *
 * Reads the adapter state, the accrued MetaMorpho vault it wraps, and the adapter's vault share
 * balance.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to downstream fetchers.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `AccrualVaultV2MorphoVaultV1Adapter` entity.
 * @throws {UnknownFactory} when the configured chain has no MorphoVaultV1Adapter factory.
 * @throws {UnknownOfFactory} when `address` is not an adapter from the configured factory.
 * @example
 * ```ts
 * import type { AccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const adapter: AccrualVaultV2MorphoVaultV1Adapter =
 *   await fetchAccrualVaultV2MorphoVaultV1Adapter(adapterAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualVaultV2MorphoVaultV1Adapter(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  const adapter = await fetchVaultV2MorphoVaultV1Adapter(
    address,
    client,
    parameters,
  );
  const [vaultV1, shares] = await Promise.all([
    fetchAccrualVault(adapter.morphoVaultV1, client, parameters),
    readContract(client, {
      ...parameters,
      address: adapter.morphoVaultV1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [adapter.address],
    }),
  ]);

  return new AccrualVaultV2MorphoVaultV1Adapter(adapter, vaultV1, shares);
}

import {
  AccrualVault,
  AccrualVaultV2MorphoVaultV1Adapter,
  getChainAddresses,
  UnknownFactory,
  UnknownOfFactory,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import { type Address, BlockNotFoundError, type Client, erc20Abi } from "viem";
import { getBlock, getChainId, readContract } from "viem/actions";
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
import { fetchVault } from "../Vault.js";
import { fetchVaultMarketAllocation } from "../VaultMarketAllocation.js";

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
 * Fetches a MorphoVaultV1Adapter with block-aligned parent-vault state and adapter shares.
 *
 * Resolves the requested block to a number, then reads the adapter, underlying MetaMorpho vault,
 * withdraw-queue allocations, and adapter share balance at that block. The nested
 * `accrualVaultV1` retains unprojected market, loss, and fee accounting from the selected block,
 * so `realAssets(timestamp)` can project the vault accounting once.
 *
 * @param address - Adapter address to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag used to resolve the snapshot; `"pending"` is
 *   unsupported because it has no block number.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to downstream fetchers.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `AccrualVaultV2MorphoVaultV1Adapter` with adapter shares and unprojected,
 *   block-aligned market allocations, Vault V1 loss, and fee accounting.
 * @throws {viem.BlockNotFoundError} when the selected block has no number, including `"pending"`.
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
  const resolvedParameters = {
    ...parameters,
    chainId: parameters.chainId ?? (await getChainId(client)),
  };
  const block = await getBlock(
    client,
    resolvedParameters.blockNumber !== undefined
      ? { blockNumber: resolvedParameters.blockNumber }
      : { blockTag: resolvedParameters.blockTag ?? "latest" },
  );
  if (block.number === null) throw new BlockNotFoundError({});
  const snapshotParameters = {
    account: resolvedParameters.account,
    stateOverride: resolvedParameters.stateOverride,
    deployless: resolvedParameters.deployless,
    chainId: resolvedParameters.chainId,
    blockNumber: block.number,
  };
  const adapter = await fetchVaultV2MorphoVaultV1Adapter(
    address,
    client,
    snapshotParameters,
  );
  const vaultV1 = await fetchVault(
    adapter.morphoVaultV1,
    client,
    snapshotParameters,
  );
  const [allocations, shares] = await Promise.all([
    Promise.all(
      vaultV1.withdrawQueue.map((marketId) =>
        fetchVaultMarketAllocation(
          vaultV1.address,
          marketId,
          client,
          snapshotParameters,
        ),
      ),
    ),
    readContract(client, {
      ...snapshotParameters,
      address: adapter.morphoVaultV1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [adapter.address],
    }),
  ]);

  return new AccrualVaultV2MorphoVaultV1Adapter(
    adapter,
    new AccrualVault(vaultV1, allocations),
    shares,
  );
}

import {
  AccrualVault,
  Eip5267Domain,
  getChainAddresses,
  type MarketId,
  UnknownFactory,
  UnknownOfFactory,
  Vault,
  VaultConfig,
  type VaultPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";
import { type Address, type Client, zeroAddress } from "viem";

import { getChainId, readContract } from "viem/actions";
import {
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  publicAllocatorAbi,
} from "../abis.js";
import { abi, code } from "../queries/GetVault.js";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchVaultConfig } from "./VaultConfig.js";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation.js";

/**
 * Fetches MetaMorpho vault state, accounting, queues, and public allocator config.
 *
 * Uses the deployless `GetVault` query by default and falls back to MetaMorpho, factory, and
 * PublicAllocator contract reads when allowed.
 *
 * @param address - MetaMorpho vault address.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `Vault` entity.
 * @throws {UnknownFactory} when the configured chain has no MetaMorpho factory.
 * @throws {UnknownOfFactory} when `address` is not a MetaMorpho vault from the configured factory.
 * @example
 * ```ts
 * import type { Vault } from "@morpho-org/blue-sdk";
 * import { fetchVault } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 *
 * const vault: Vault = await fetchVault(vaultAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVault(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { publicAllocator, metaMorphoFactory } = getChainAddresses(
    parameters.chainId,
  );

  if (!metaMorphoFactory) {
    throw new UnknownFactory();
  }

  if (deployless) {
    try {
      const {
        config,
        owner,
        curator,
        guardian,
        timelock,
        pendingTimelock,
        pendingGuardian,
        pendingOwner,
        fee,
        feeRecipient,
        skimRecipient,
        totalSupply,
        totalAssets,
        lastTotalAssets,
        supplyQueue,
        withdrawQueue,
        publicAllocatorConfig,
      } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, publicAllocator ?? zeroAddress, metaMorphoFactory],
      });

      return new Vault({
        ...new VaultConfig({
          ...config,
          eip5267Domain: new Eip5267Domain(config.eip5267Domain),
          address,
        }),
        owner,
        curator,
        guardian,
        feeRecipient,
        skimRecipient,
        timelock,
        fee,
        pendingOwner,
        pendingGuardian,
        pendingTimelock,
        publicAllocatorConfig:
          publicAllocator != null ? publicAllocatorConfig : undefined,
        supplyQueue: supplyQueue as MarketId[],
        withdrawQueue: withdrawQueue as MarketId[],
        totalSupply,
        totalAssets,
        lastTotalAssets,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [
    config,
    curator,
    owner,
    guardian,
    timelock,
    pendingTimelock,
    pendingGuardian,
    pendingOwner,
    fee,
    feeRecipient,
    skimRecipient,
    totalSupply,
    totalAssets,
    lastTotalAssets,
    lostAssets,
    supplyQueueSize,
    withdrawQueueSize,
    hasPublicAllocator,
    isMetaMorphoV1_1,
  ] = await Promise.all([
    fetchVaultConfig(address, client, { ...parameters, deployless }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "curator",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "owner",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "guardian",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "timelock",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingTimelock",
    }).then(([value, validAt]) => ({ value, validAt })),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingGuardian",
    }).then(([value, validAt]) => ({ value, validAt })),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingOwner",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "fee",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "feeRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "skimRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "totalSupply",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "totalAssets",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "lastTotalAssets",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "lostAssets",
    }).catch(() => undefined),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "supplyQueueLength",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "withdrawQueueLength",
    }),
    publicAllocator != null &&
      readContract(client, {
        ...parameters,
        address,
        abi: metaMorphoAbi,
        functionName: "isAllocator",
        args: [publicAllocator],
      }),
    readContract(client, {
      ...parameters,
      address: metaMorphoFactory,
      abi: metaMorphoFactoryAbi,
      functionName: "isMetaMorpho",
      args: [address],
    }).catch(() => false),
  ]);

  // Fallback to the MetaMorphoV1.0 factory on Ethereum (1) and Base (8453)
  const isMetaMorphoV1_0Promise =
    !isMetaMorphoV1_1 &&
    (parameters.chainId === 1 || parameters.chainId === 8453)
      ? readContract(client, {
          ...parameters,
          address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
          abi: metaMorphoFactoryAbi,
          functionName: "isMetaMorpho",
          args: [address],
        })
      : Promise.resolve(false);

  let publicAllocatorConfigPromise:
    | Promise<VaultPublicAllocatorConfig>
    | undefined;
  if (hasPublicAllocator)
    publicAllocatorConfigPromise = Promise.all([
      readContract(client, {
        ...parameters,
        address: publicAllocator!,
        abi: publicAllocatorAbi,
        functionName: "admin",
        args: [address],
      }),
      readContract(client, {
        ...parameters,
        address: publicAllocator!,
        abi: publicAllocatorAbi,
        functionName: "fee",
        args: [address],
      }),
      readContract(client, {
        ...parameters,
        address: publicAllocator!,
        abi: publicAllocatorAbi,
        functionName: "accruedFee",
        args: [address],
      }),
      // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
    ]).then(([admin, fee, accruedFee]) => ({ admin, fee, accruedFee }));

  const [supplyQueue, withdrawQueue, publicAllocatorConfig, isMetaMorphoV1_0] =
    await Promise.all([
      Promise.all(
        Array.from(
          { length: Number(supplyQueueSize) },
          (_, i) =>
            readContract(client, {
              ...parameters,
              address,
              abi: metaMorphoAbi,
              functionName: "supplyQueue",
              args: [BigInt(i)],
            }) as Promise<MarketId>,
        ),
      ),
      Promise.all(
        Array.from(
          { length: Number(withdrawQueueSize) },
          (_, i) =>
            readContract(client, {
              ...parameters,
              address,
              abi: metaMorphoAbi,
              functionName: "withdrawQueue",
              args: [BigInt(i)],
            }) as Promise<MarketId>,
        ),
      ),
      publicAllocatorConfigPromise,
      isMetaMorphoV1_0Promise,
    ]);

  const isMetaMorpho = isMetaMorphoV1_1 || isMetaMorphoV1_0;
  if (!isMetaMorpho) {
    throw new UnknownOfFactory(metaMorphoFactory, address);
  }

  return new Vault({
    ...config,
    owner,
    curator,
    guardian,
    feeRecipient,
    skimRecipient,
    timelock,
    fee,
    pendingOwner,
    pendingGuardian,
    pendingTimelock,
    publicAllocatorConfig,
    supplyQueue,
    withdrawQueue,
    totalSupply,
    totalAssets,
    lastTotalAssets,
    lostAssets,
  });
}

/**
 * Fetches MetaMorpho vault state with accrued market allocations.
 *
 * Reads the vault state with `fetchVault`, then fetches an accrued `VaultMarketAllocation` for every
 * market in the withdraw queue.
 *
 * @param address - MetaMorpho vault address.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `AccrualVault` entity with accrued market allocations.
 * @throws {UnknownFactory} when the configured chain has no MetaMorpho factory.
 * @throws {UnknownOfFactory} when `address` is not a MetaMorpho vault from the configured factory.
 * @example
 * ```ts
 * import type { AccrualVault } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 *
 * const vault: AccrualVault = await fetchAccrualVault(vaultAddress, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualVault(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const vault = await fetchVault(address, client, parameters);
  const allocations = await Promise.all(
    vault.withdrawQueue.map((marketId) =>
      fetchVaultMarketAllocation(vault.address, marketId, client, parameters),
    ),
  );

  return new AccrualVault(vault, allocations);
}

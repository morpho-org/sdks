import type { Address, Client } from "viem";

import {
  AccrualVault,
  ChainUtils,
  type MarketId,
  Vault,
  VaultConfig,
  type VaultPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi, publicAllocatorAbi } from "../abis.js";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation.js";

import { abi, code } from "../queries/GetVault.js";
import { fetchVaultConfig } from "./VaultConfig.js";

export async function fetchVault(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const { publicAllocator } = addresses[parameters.chainId];

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
        args: [address, publicAllocator],
      });

      return new Vault({
        ...new VaultConfig({ ...config, address }, parameters.chainId),
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
        supplyQueue: supplyQueue as MarketId[],
        withdrawQueue: withdrawQueue as MarketId[],
        totalSupply,
        totalAssets,
        lastTotalAssets,
      });
    } catch {
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
    supplyQueueSize,
    withdrawQueueSize,
    hasPublicAllocator,
  ] = await Promise.all([
    fetchVaultConfig(address, client, parameters),
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
      functionName: "supplyQueueLength",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: metaMorphoAbi,
      functionName: "withdrawQueueLength",
    }),
    publicAllocator &&
      readContract(client, {
        ...parameters,
        address,
        abi: metaMorphoAbi,
        functionName: "isAllocator",
        args: [publicAllocator],
      }),
  ]);
  let publicAllocatorConfigPromise:
    | Promise<VaultPublicAllocatorConfig>
    | undefined;
  if (hasPublicAllocator)
    publicAllocatorConfigPromise = Promise.all([
      readContract(client, {
        ...parameters,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "admin",
        args: [address],
      }),
      readContract(client, {
        ...parameters,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "fee",
        args: [address],
      }),
      readContract(client, {
        ...parameters,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "accruedFee",
        args: [address],
      }),
    ]).then(([admin, fee, accruedFee]) => ({ admin, fee, accruedFee }));
  const [supplyQueue, withdrawQueue, publicAllocatorConfig] = await Promise.all(
    [
      Promise.all(
        new Array(Number(supplyQueueSize)).fill(null).map(
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
        new Array(Number(withdrawQueueSize)).fill(null).map(
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
    ],
  );
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
  });
}
export async function fetchAccrualVault(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );
  const vault = await fetchVault(address, client, parameters);
  const allocations = await Promise.all(
    Array.from(
      new Set(vault.supplyQueue.concat(vault.withdrawQueue)),
      (marketId) =>
        fetchVaultMarketAllocation(vault.address, marketId, client, parameters),
    ),
  );
  return new AccrualVault(vault, allocations);
}

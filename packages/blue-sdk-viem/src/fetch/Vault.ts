import { type Address, type Client, zeroAddress } from "viem";

import {
  AccrualVault,
  Eip5267Domain,
  type MarketId,
  UnknownFactory,
  UnknownFromFactory,
  Vault,
  VaultConfig,
  type VaultPublicAllocatorConfig,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import {
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  publicAllocatorAbi,
} from "../abis";
import type { DeploylessFetchParameters } from "../types";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation";

import { abi, code } from "../queries/GetVault";
import { fetchVaultConfig } from "./VaultConfig";

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
    isMetaMorpho,
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
    (async () => {
      try {
        const isMetaMorpho = await readContract(client, {
          ...parameters,
          address: metaMorphoFactory,
          abi: metaMorphoFactoryAbi,
          functionName: "isMetaMorpho",
          args: [address],
        });

        if (isMetaMorpho) return true;
      } catch {
        // Fallback to the MetaMorphoV1.0 factory on Ethereum (1) and Base (8453)
        if (parameters.chainId === 1 || parameters.chainId === 8453) {
          return await readContract(client, {
            ...parameters,
            address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
            abi: metaMorphoFactoryAbi,
            functionName: "isMetaMorpho",
            args: [address],
          });
        }
        return false;
      }
    })(),
  ]);

  if (!isMetaMorpho) {
    throw new UnknownFromFactory(metaMorphoFactory, address);
  }

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
    ]).then(([admin, fee, accruedFee]) => ({ admin, fee, accruedFee }));

  const [supplyQueue, withdrawQueue, publicAllocatorConfig] = await Promise.all(
    [
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
    lostAssets,
  });
}
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

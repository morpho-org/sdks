import { Address, Client } from "viem";

import {
  AccrualVault,
  ChainUtils,
  MarketId,
  Vault,
  VaultConfig,
  VaultPublicAllocatorConfig,
  addresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi, publicAllocatorAbi } from "../abis";
import { FetchOptions } from "../types";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation";

import { abi, code } from "../queries/GetVault";
import { fetchVaultConfig } from "./VaultConfig";

export async function fetchVault(
  address: Address,
  client: Client,
  {
    chainId,
    overrides = {},
    deployless = true,
  }: FetchOptions & { deployless?: boolean } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { publicAllocator } = addresses[chainId];

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
        ...overrides,
        abi,
        code,
        functionName: "query",
        args: [address, publicAllocator],
      });

      return new Vault({
        config: new VaultConfig({ ...config, address }, chainId),
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
    fetchVaultConfig(address, client, { chainId }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "curator",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "owner",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "guardian",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "timelock",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingTimelock",
    }).then(([value, validAt]) => ({ value, validAt })),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingGuardian",
    }).then(([value, validAt]) => ({ value, validAt })),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingOwner",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "fee",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "feeRecipient",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "skimRecipient",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "totalSupply",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "totalAssets",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "lastTotalAssets",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "supplyQueueLength",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "withdrawQueueLength",
    }),
    publicAllocator &&
      readContract(client, {
        ...overrides,
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
        ...overrides,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "admin",
        args: [address],
      }),
      readContract(client, {
        ...overrides,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "fee",
        args: [address],
      }),
      readContract(client, {
        ...overrides,
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
              ...overrides,
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
              ...overrides,
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
    config,
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
  options: FetchOptions & { deployless?: boolean } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );
  const vault = await fetchVault(address, client, options);
  const allocations = await Promise.all(
    [...new Set(vault.supplyQueue.concat(vault.withdrawQueue))].map(
      (marketId) =>
        fetchVaultMarketAllocation(
          vault.address as Address,
          marketId,
          client,
          options,
        ),
    ),
  );
  return new AccrualVault(vault, allocations);
}

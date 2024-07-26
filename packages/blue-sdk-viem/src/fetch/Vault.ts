import { Address, Client } from "viem";

import {
  AccrualVault,
  ChainId,
  ChainUtils,
  MarketId,
  Vault,
  VaultConfig,
  VaultPublicAllocatorConfig,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { getChainId, readContract } from "viem/actions";
import { metaMorphoAbi, publicAllocatorAbi } from "../abis";
import { ViewOverrides } from "../types";
import { fetchVaultConfig } from "./VaultConfig";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation";

export async function fetchVault(
  address: Address,
  client: Client,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  const config = await fetchVaultConfig(address, client, options);

  return fetchVaultFromConfig(address, config, client, options);
}

export async function fetchVaultFromConfig(
  address: Address,
  config: VaultConfig,
  client: Client,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const { publicAllocator } = getChainAddresses(chainId);

  const [
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
        args: [publicAllocator as Address],
      }),
  ]);

  let publicAllocatorConfigPromise:
    | Promise<VaultPublicAllocatorConfig>
    | undefined;

  if (hasPublicAllocator)
    publicAllocatorConfigPromise = Promise.all([
      readContract(client, {
        ...overrides,
        address: publicAllocator as Address,
        abi: publicAllocatorAbi,
        functionName: "admin",
        args: [address],
      }),
      readContract(client, {
        ...overrides,
        address: publicAllocator as Address,
        abi: publicAllocatorAbi,
        functionName: "fee",
        args: [address],
      }),
      readContract(client, {
        ...overrides,
        address: publicAllocator as Address,
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
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
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

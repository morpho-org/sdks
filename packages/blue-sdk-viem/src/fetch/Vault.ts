import {
  Account,
  Address,
  Chain,
  ParseAccount,
  PublicClient,
  RpcSchema,
  Transport,
} from "viem";

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

import { metaMorphoAbi, publicAllocatorAbi } from "../abis";
import { ViewOverrides } from "../types";
import { fetchVaultConfig } from "./VaultConfig";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation";

export async function fetchVault<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  address: Address,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
  );

  const config = await fetchVaultConfig(address, client, options);

  return fetchVaultFromConfig(address, config, client, options);
}

export async function fetchVaultFromConfig<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  address: Address,
  config: VaultConfig,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await client.getChainId()),
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
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "curator",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "owner",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "guardian",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "timelock",
    }),
    client
      .readContract({
        ...overrides,
        address,
        abi: metaMorphoAbi,
        functionName: "pendingTimelock",
      })
      .then(([value, validAt]) => ({ value, validAt })),
    client
      .readContract({
        ...overrides,
        address,
        abi: metaMorphoAbi,
        functionName: "pendingGuardian",
      })
      .then(([value, validAt]) => ({ value, validAt })),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "pendingOwner",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "fee",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "feeRecipient",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "skimRecipient",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "totalSupply",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "totalAssets",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "lastTotalAssets",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "supplyQueueLength",
    }),
    client.readContract({
      ...overrides,
      address,
      abi: metaMorphoAbi,
      functionName: "withdrawQueueLength",
    }),
    publicAllocator &&
      client.readContract({
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
      client.readContract({
        ...overrides,
        address: publicAllocator as Address,
        abi: publicAllocatorAbi,
        functionName: "admin",
        args: [address],
      }),
      client.readContract({
        ...overrides,
        address: publicAllocator as Address,
        abi: publicAllocatorAbi,
        functionName: "fee",
        args: [address],
      }),
      client.readContract({
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
            client.readContract({
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
            client.readContract({
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

export async function fetchAccrualVault<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  address: Address,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await client.getChainId()),
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

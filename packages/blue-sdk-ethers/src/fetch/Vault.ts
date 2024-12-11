import { type Provider, resolveProperties } from "ethers";
import { MetaMorpho__factory, PublicAllocator__factory } from "ethers-types";

import {
  AccrualVault,
  type Address,
  ChainUtils,
  type MarketId,
  Vault,
  type VaultConfig,
  type VaultPublicAllocatorConfig,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types.js";
import { fetchVaultConfig } from "./VaultConfig.js";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation.js";

export async function fetchVault(
  address: Address,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const config = await fetchVaultConfig(address, runner, options);

  return fetchVaultFromConfig(address, config, runner, options);
}

export async function fetchVaultFromConfig(
  address: Address,
  config: VaultConfig,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const chainAddresses = getChainAddresses(chainId);
  const mm = MetaMorpho__factory.connect(
    address,
    // @ts-ignore incompatible commonjs type
    runner,
  );

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
    mm.curator(overrides) as Promise<Address>,
    mm.owner(overrides) as Promise<Address>,
    mm.guardian(overrides) as Promise<Address>,
    mm.timelock(overrides),
    mm
      .pendingTimelock(overrides)
      .then(({ value, validAt }) => ({ value, validAt })),
    mm
      .pendingGuardian(overrides)
      .then(({ value, validAt }) => ({ value: value as Address, validAt })),
    mm.pendingOwner(overrides) as Promise<Address>,
    mm.fee(overrides),
    mm.feeRecipient(overrides) as Promise<Address>,
    mm.skimRecipient(overrides) as Promise<Address>,
    mm.totalSupply(overrides),
    mm.totalAssets(overrides),
    mm.lastTotalAssets(overrides),
    mm.supplyQueueLength(overrides).then((r) => Number(r)),
    mm.withdrawQueueLength(overrides).then((r) => Number(r)),
    chainAddresses.publicAllocator &&
      mm.isAllocator(chainAddresses.publicAllocator, overrides),
  ]);

  let publicAllocatorConfigPromise:
    | Promise<VaultPublicAllocatorConfig>
    | undefined;

  if (hasPublicAllocator) {
    const publicAllocator = PublicAllocator__factory.connect(
      chainAddresses.publicAllocator!,
      // @ts-ignore incompatible commonjs type
      runner,
    );

    publicAllocatorConfigPromise = resolveProperties({
      admin: publicAllocator.admin(address, overrides) as Promise<Address>,
      fee: publicAllocator.fee(address, overrides),
      accruedFee: publicAllocator.accruedFee(address, overrides),
    });
  }

  const [supplyQueue, withdrawQueue, publicAllocatorConfig] = await Promise.all(
    [
      Promise.all(
        new Array(supplyQueueSize)
          .fill(null)
          .map((_, i) => mm.supplyQueue(i, overrides) as Promise<MarketId>),
      ),
      Promise.all(
        new Array(withdrawQueueSize)
          .fill(null)
          .map((_, i) => mm.withdrawQueue(i, overrides) as Promise<MarketId>),
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
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const vault = await fetchVault(address, runner, options);

  const allocations = await Promise.all(
    Array.from(vault.withdrawQueue, (marketId) =>
      fetchVaultMarketAllocation(vault.address, marketId, runner, options),
    ),
  );

  return new AccrualVault(vault, allocations);
}

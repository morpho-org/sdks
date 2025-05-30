import { type Provider, resolveProperties } from "ethers";
import {
  MetaMorphoV1_1__factory,
  MetaMorpho__factory,
  PublicAllocator__factory,
} from "ethers-types";

import {
  AccrualVault,
  type Address,
  type MarketId,
  Vault,
  type VaultPublicAllocatorConfig,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";
import { fetchVaultConfig } from "./VaultConfig";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation";

export async function fetchVault(
  address: Address,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const chainAddresses = getChainAddresses(options.chainId);
  const mm = MetaMorpho__factory.connect(address, runner);

  const { overrides = {} } = options;

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
  ] = await Promise.all([
    fetchVaultConfig(address, runner, options),
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
    MetaMorphoV1_1__factory.connect(address, runner)
      .lostAssets(overrides)
      .catch(() => undefined),
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
    lostAssets,
  });
}

export async function fetchAccrualVault(
  address: Address,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const vault = await fetchVault(address, runner, options);

  const allocations = await Promise.all(
    Array.from(vault.withdrawQueue, (marketId) =>
      fetchVaultMarketAllocation(vault.address, marketId, runner, options),
    ),
  );

  return new AccrualVault(vault, allocations);
}

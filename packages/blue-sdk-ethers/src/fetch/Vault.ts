import { Provider, resolveProperties } from "ethers";
import { MetaMorpho__factory, PublicAllocator__factory } from "ethers-types";
import { ViewOverrides } from "ethers-types/dist/common";

import {
  AccrualVault,
  Address,
  ChainId,
  ChainUtils,
  getChainAddresses,
  MarketId,
  Vault,
  VaultConfig,
  VaultMarketAllocation,
  VaultPublicAllocatorConfig,
} from "@morpho-org/blue-sdk";

import "./VaultConfig";
import "./VaultMarketAllocation";

export async function fetchVault(
  address: Address,
  runner: { provider: Provider },
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const config = await VaultConfig.fetch(address, runner, options);

  return Vault.fetchFromConfig(address, config, runner, options);
}

export async function fetchVaultFromConfig(
  address: Address,
  config: VaultConfig,
  runner: { provider: Provider },
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const chainAddresses = getChainAddresses(chainId);
  const mm = MetaMorpho__factory.connect(address, runner);

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
    mm.curator(overrides),
    mm.owner(overrides),
    mm.guardian(overrides),
    mm.timelock(overrides),
    mm
      .pendingTimelock(overrides)
      .then(({ value, validAt }) => ({ value, validAt })),
    mm
      .pendingGuardian(overrides)
      .then(({ value, validAt }) => ({ value, validAt })),
    mm.pendingOwner(overrides),
    mm.fee(overrides),
    mm.feeRecipient(overrides),
    mm.skimRecipient(overrides),
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
      runner,
    );

    publicAllocatorConfigPromise = resolveProperties({
      admin: publicAllocator.admin(address, overrides),
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
  runner: { provider: Provider },
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const vault = await Vault.fetch(address, runner, options);

  const allocations = await Promise.all(
    [...new Set(vault.supplyQueue.concat(vault.withdrawQueue))].map(
      (marketId) =>
        VaultMarketAllocation.fetch(vault.address, marketId, runner, options),
    ),
  );

  return new AccrualVault(vault, allocations);
}

declare module "@morpho-org/blue-sdk" {
  namespace Vault {
    let fetch: typeof fetchVault;
    let fetchFromConfig: typeof fetchVaultFromConfig;
  }

  namespace AccrualVault {
    let fetch: typeof fetchAccrualVault;
  }
}

Vault.fetch = fetchVault;
Vault.fetchFromConfig = fetchVaultFromConfig;
AccrualVault.fetch = fetchAccrualVault;

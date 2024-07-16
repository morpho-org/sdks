import { Provider } from "ethers";
import { ViewOverrides } from "ethers-types/dist/common";

import {
  AccrualPosition,
  Address,
  ChainId,
  ChainUtils,
  MarketId,
  VaultMarketAllocation,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";

import "./Position";
import "./VaultMarketConfig";

export async function fetchVaultMarketAllocation(
  vault: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {}
) {
  options.chainId = ChainUtils.parseSupportedChainId(options.chainId ?? (await runner.provider.getNetwork()).chainId);

  const config = await VaultMarketConfig.fetch(vault, marketId, runner, options);

  return VaultMarketAllocation.fetchFromConfig(config, marketId, runner, options);
}

export async function fetchVaultMarketAllocationFromConfig(
  config: VaultMarketConfig,
  marketId: MarketId,
  runner: { provider: Provider },
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {}
) {
  options.chainId = ChainUtils.parseSupportedChainId(options.chainId ?? (await runner.provider.getNetwork()).chainId);

  return new VaultMarketAllocation({
    config,
    position: await AccrualPosition.fetch(config.vault, marketId, runner, options),
  });
}

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
    let fetchFromConfig: typeof fetchVaultMarketAllocationFromConfig;
  }
}

VaultMarketAllocation.fetch = fetchVaultMarketAllocation;
VaultMarketAllocation.fetchFromConfig = fetchVaultMarketAllocationFromConfig;

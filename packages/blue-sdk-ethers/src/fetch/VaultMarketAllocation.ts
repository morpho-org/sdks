import type { Provider } from "ethers";

import {
  type Address,
  ChainUtils,
  type MarketId,
  VaultMarketAllocation,
  type VaultMarketConfig,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types.js";
import { fetchAccrualPosition } from "./Position.js";
import { fetchVaultMarketConfig } from "./VaultMarketConfig.js";

export async function fetchVaultMarketAllocation(
  vault: Address,
  marketId: MarketId,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const config = await fetchVaultMarketConfig(vault, marketId, runner, options);

  return fetchVaultMarketAllocationFromConfig(
    config,
    marketId,
    runner,
    options,
  );
}

export async function fetchVaultMarketAllocationFromConfig(
  config: VaultMarketConfig,
  marketId: MarketId,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  return new VaultMarketAllocation({
    config,
    position: await fetchAccrualPosition(
      config.vault,
      marketId,
      runner,
      options,
    ),
  });
}

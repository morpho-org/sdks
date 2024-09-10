import { Provider } from "ethers";

import {
  Address,
  ChainUtils,
  MarketId,
  VaultMarketAllocation,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";
import { FetchOptions } from "../types";
import { fetchAccrualPosition } from "./Position";
import { fetchVaultMarketConfig } from "./VaultMarketConfig";

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

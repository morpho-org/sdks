import { Address, Client } from "viem";

import {
  ChainId,
  ChainUtils,
  MarketId,
  VaultMarketAllocation,
  VaultMarketConfig,
} from "@morpho-org/blue-sdk";

import { getChainId } from "viem/actions";
import { ViewOverrides } from "../types";
import { fetchAccrualPosition } from "./Position";
import { fetchVaultMarketConfig } from "./VaultMarketConfig";

export async function fetchVaultMarketAllocation(
  vault: Address,
  marketId: MarketId,
  client: Client,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  const config = await fetchVaultMarketConfig(vault, marketId, client, options);

  return fetchVaultMarketAllocationFromConfig(
    config,
    marketId,
    client,
    options,
  );
}

export async function fetchVaultMarketAllocationFromConfig(
  config: VaultMarketConfig,
  marketId: MarketId,
  client: Client,
  options: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  return new VaultMarketAllocation({
    config,
    position: await fetchAccrualPosition(
      config.vault as Address,
      marketId,
      client,
      options,
    ),
  });
}

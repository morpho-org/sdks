import { Address, Client } from "viem";

import {
  ChainUtils,
  MarketId,
  VaultMarketAllocation,
} from "@morpho-org/blue-sdk";

import { getChainId } from "viem/actions";
import { FetchOptions } from "../types";
import { fetchAccrualPosition } from "./Position";
import { fetchVaultMarketConfig } from "./VaultMarketConfig";

export async function fetchVaultMarketAllocation(
  vault: Address,
  marketId: MarketId,
  client: Client,
  options: FetchOptions & { deployless?: boolean } = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await getChainId(client)),
  );

  const [config, position] = await Promise.all([
    fetchVaultMarketConfig(vault, marketId, client, options),
    fetchAccrualPosition(vault, marketId, client, options),
  ]);

  return new VaultMarketAllocation({ config, position });
}

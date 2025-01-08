import type { Address, Client } from "viem";

import {
  ChainUtils,
  type MarketId,
  VaultMarketAllocation,
} from "@morpho-org/blue-sdk";

import { getChainId } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";
import { fetchAccrualPosition } from "./Position";
import { fetchVaultMarketConfig } from "./VaultMarketConfig";

export async function fetchVaultMarketAllocation(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  const [config, position] = await Promise.all([
    fetchVaultMarketConfig(vault, marketId, client, parameters),
    fetchAccrualPosition(vault, marketId, client, parameters),
  ]);

  return new VaultMarketAllocation({ config, position });
}

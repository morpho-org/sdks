import { type MarketId, VaultMarketAllocation } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";

import { getChainId } from "viem/actions";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchAccrualPosition } from "./Position.js";
import { fetchVaultMarketConfig } from "./VaultMarketConfig.js";

// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultMarketAllocation(
  vault: Address,
  marketId: MarketId,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const [config, position] = await Promise.all([
    fetchVaultMarketConfig(vault, marketId, client, parameters),
    fetchAccrualPosition(vault, marketId, client, parameters),
  ]);

  return new VaultMarketAllocation({ config, position });
}

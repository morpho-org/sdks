import { type MarketId, VaultMarketAllocation } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";

import { getChainId } from "viem/actions";
import type { DeploylessFetchParameters } from "../types.js";
import { fetchAccrualPosition } from "./Position.js";
import { fetchVaultMarketConfig } from "./VaultMarketConfig.js";

/**
 * Fetches a MetaMorpho vault market allocation with accrued market position state.
 *
 * Reads the market config from the vault and the vault's accrued position in the market.
 *
 * @param vault - MetaMorpho vault address.
 * @param marketId - Market id whose allocation is fetched.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode forwarded to downstream fetchers.
 * @returns The hydrated `VaultMarketAllocation` entity.
 * @example
 * ```ts
 * import type { MarketId, VaultMarketAllocation } from "@morpho-org/blue-sdk";
 * import { fetchVaultMarketAllocation } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const allocation: VaultMarketAllocation = await fetchVaultMarketAllocation(
 *   vault,
 *   marketId,
 *   client,
 * );
 * ```
 */
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

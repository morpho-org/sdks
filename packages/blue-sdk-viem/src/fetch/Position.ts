import {
  AccrualPosition,
  getChainAddresses,
  type MarketId,
  Position,
  PreLiquidationParams,
  PreLiquidationPosition,
} from "@morpho-org/blue-sdk";

import type { Address, Client } from "viem";
import { getChainId, readContract } from "viem/actions";
import { blueAbi, blueOracleAbi, preLiquidationAbi } from "../abis.js";
import type { DeploylessFetchParameters, FetchParameters } from "../types.js";
import { readContractRestructured } from "../utils.js";
import { fetchMarket } from "./Market.js";

/**
 * Fetches a user's raw Morpho Blue position for a market.
 *
 * Reads `Morpho.position(marketId, user)` from the configured chain.
 *
 * @param user - Address whose position is fetched.
 * @param marketId - Market id of the position.
 * @param client - Viem client used for the contract read.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Position` entity.
 * @example
 * ```ts
 * import type { MarketId, Position } from "@morpho-org/blue-sdk";
 * import { fetchPosition } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const position: Position = await fetchPosition(user, marketId, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchPosition(
  user: Address,
  marketId: MarketId,
  client: Client,
  parameters: FetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morpho } = getChainAddresses(parameters.chainId);
  const position = await readContractRestructured(client, {
    ...parameters,
    address: morpho,
    abi: blueAbi,
    functionName: "position",
    args: [marketId, user],
  });

  return new Position({
    user,
    marketId,
    ...position,
  });
}

/**
 * Fetches pre-liquidation parameters from a pre-liquidation contract.
 *
 * Reads `preLiquidationParams()` and wraps the result in `PreLiquidationParams`.
 *
 * @param preLiquidation - Address of the pre-liquidation contract.
 * @param client - Viem client used for the contract read.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode forwarded by callers.
 * @returns The hydrated `PreLiquidationParams` entity.
 * @example
 * ```ts
 * import type { PreLiquidationParams } from "@morpho-org/blue-sdk";
 * import { fetchPreLiquidationParams } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const preLiquidation = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const params: PreLiquidationParams = await fetchPreLiquidationParams(
 *   preLiquidation,
 *   client,
 * );
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchPreLiquidationParams(
  preLiquidation: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
): Promise<PreLiquidationParams> {
  parameters.chainId ??= await getChainId(client);
  const { preLltv, preLIF1, preLIF2, preLCF1, preLCF2, preLiquidationOracle } =
    await readContract(client, {
      ...parameters,
      address: preLiquidation,
      abi: preLiquidationAbi,
      functionName: "preLiquidationParams",
    });

  return new PreLiquidationParams({
    preLltv,
    preLCF1,
    preLCF2,
    preLIF1,
    preLIF2,
    preLiquidationOracle,
  });
}

/**
 * Fetches a user's Morpho Blue position with accrued market state.
 *
 * Reads the raw user position and the current market state, then combines them into an
 * `AccrualPosition`.
 *
 * @param user - Address whose position is fetched.
 * @param marketId - Market id of the position.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `AccrualPosition` entity.
 * @example
 * ```ts
 * import type { AccrualPosition, MarketId } from "@morpho-org/blue-sdk";
 * import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const position: AccrualPosition = await fetchAccrualPosition(user, marketId, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualPosition(
  user: Address,
  marketId: MarketId,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const [position, market] = await Promise.all([
    fetchPosition(user, marketId, client, parameters),
    fetchMarket(marketId, client, parameters),
  ]);

  return new AccrualPosition(position, market);
}

/**
 * Fetches a user's position with pre-liquidation state and oracle pricing.
 *
 * Reads the raw user position, market state, pre-liquidation params, and pre-liquidation oracle price
 * when available.
 *
 * @param user - Address whose position is fetched.
 * @param marketId - Market id of the position.
 * @param preLiquidation - Address of the pre-liquidation contract.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to downstream fetchers.
 * @returns The hydrated `PreLiquidationPosition` entity.
 * @example
 * ```ts
 * import type { MarketId, PreLiquidationPosition } from "@morpho-org/blue-sdk";
 * import { fetchPreLiquidationPosition } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 * const preLiquidation = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const position: PreLiquidationPosition = await fetchPreLiquidationPosition(
 *   user,
 *   marketId,
 *   preLiquidation,
 *   client,
 * );
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchPreLiquidationPosition(
  user: Address,
  marketId: MarketId,
  preLiquidation: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const [position, market, preLiquidationParams] = await Promise.all([
    fetchPosition(user, marketId, client, parameters),
    fetchMarket(marketId, client, parameters),
    fetchPreLiquidationParams(preLiquidation, client, parameters),
  ]);

  const preLiquidationOraclePrice = await readContract(client, {
    ...parameters,
    address: preLiquidationParams.preLiquidationOracle,
    abi: blueOracleAbi,
    functionName: "price",
  }).catch(() => undefined);

  return new PreLiquidationPosition(
    {
      ...position,
      preLiquidationParams,
      preLiquidation,
      preLiquidationOraclePrice,
    },
    market,
  );
}

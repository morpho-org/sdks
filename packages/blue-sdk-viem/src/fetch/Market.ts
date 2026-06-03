import {
  getChainAddresses,
  Market,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { type Client, zeroAddress } from "viem";

import { getChainId, readContract } from "viem/actions";
import { adaptiveCurveIrmAbi, blueAbi, blueOracleAbi } from "../abis.js";
import { abi, code } from "../queries/GetMarket.js";
import type { DeploylessFetchParameters } from "../types.js";
import { readContractRestructured } from "../utils.js";

/**
 * Fetches Morpho Blue market state, params, oracle price, and adaptive IRM rate.
 *
 * Reads `Morpho.idToMarketParams(id)`, `Morpho.market(id)`, the market oracle price when configured,
 * and `AdaptiveCurveIRM.rateAtTarget(id)` when the market uses the adaptive curve IRM. Uses the
 * deployless `GetMarket` query by default and falls back to individual reads when allowed.
 *
 * @param id - Market id to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `Market` entity.
 * @example
 * ```ts
 * import type { Market, MarketId } from "@morpho-org/blue-sdk";
 * import { fetchMarket } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const market: Market = await fetchMarket(marketId, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchMarket(
  id: MarketId,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const { morpho, adaptiveCurveIrm } = getChainAddresses(parameters.chainId);

  /* v8 ignore next: V8 reports a negative false-branch count here; deployless=false is tested. */
  if (deployless) {
    try {
      const {
        marketParams,
        market: {
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee,
        },
        hasPrice,
        price,
        rateAtTarget,
      } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [morpho, id, adaptiveCurveIrm],
      });

      return new Market({
        params: new MarketParams(marketParams),
        totalSupplyAssets,
        totalBorrowAssets,
        totalSupplyShares,
        totalBorrowShares,
        lastUpdate,
        fee,
        price: hasPrice ? price : undefined,
        rateAtTarget:
          marketParams.irm === adaptiveCurveIrm ? rateAtTarget : undefined,
      });
    } catch (error) {
      if (deployless === "force") throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [params, market] = await Promise.all([
    readContractRestructured(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "idToMarketParams",
      args: [id],
    }),
    readContractRestructured(client, {
      ...parameters,
      address: morpho,
      abi: blueAbi,
      functionName: "market",
      args: [id],
    }),
  ]);

  const [price, rateAtTarget] = await Promise.all([
    params.oracle !== zeroAddress
      ? readContract(client, {
          ...parameters,
          address: params.oracle,
          abi: blueOracleAbi,
          functionName: "price",
        }).catch(() => undefined)
      : undefined,
    params.irm === adaptiveCurveIrm
      ? readContract(client, {
          ...parameters,
          address: adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [id],
        })
      : undefined,
  ]);

  return new Market({
    params,
    ...market,
    price,
    rateAtTarget,
  });
}

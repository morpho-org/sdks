import type { Hash } from "viem";
import { getChainId, readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { Market, MarketParams } from "../market/index.js";
import { callParameters } from "./_utils.js";
import type { MidnightFetchParams } from "./types.js";

/**
 * Fetches immutable market params by id.
 *
 * @param params - Fetch parameters.
 * @returns Market params instance.
 * @example
 * ```ts
 * import { fetchMarketParams } from "@morpho-org/midnight-sdk";
 *
 * const params = await fetchMarketParams({} as never);
 * console.log(params.loanToken);
 * ```
 */
export async function fetchMarketParams(
  params: MidnightFetchParams & {
    readonly marketId: Hash;
  },
) {
  const market = await readContract(params.client, {
    ...callParameters(params),
    address: params.midnight,
    abi: midnightAbi,
    functionName: "toMarket",
    args: [params.marketId],
  });

  return new MarketParams(market);
}

/**
 * Fetches a hydrated market by id.
 *
 * @param params - Fetch parameters.
 * @returns Market instance.
 * @example
 * ```ts
 * import { fetchMarket } from "@morpho-org/midnight-sdk";
 *
 * const market = await fetchMarket({} as never);
 * console.log(market.params.loanToken);
 * ```
 */
export async function fetchMarket(
  params: MidnightFetchParams & {
    readonly marketId: Hash;
  },
) {
  const [chainId, marketParams, state] = await Promise.all([
    params.client.chain?.id ?? getChainId(params.client),
    fetchMarketParams(params),
    readContract(params.client, {
      ...callParameters(params),
      address: params.midnight,
      abi: midnightAbi,
      functionName: "marketState",
      args: [params.marketId],
    }),
  ]);
  const [
    totalUnits,
    lossFactor,
    withdrawable,
    continuousFeeCredit,
    settlementFeeCbps0,
    settlementFeeCbps1,
    settlementFeeCbps2,
    settlementFeeCbps3,
    settlementFeeCbps4,
    settlementFeeCbps5,
    settlementFeeCbps6,
    continuousFee,
    tickSpacing,
  ] = state;

  return new Market({
    chainId,
    params: marketParams,
    totalUnits,
    lossFactor,
    withdrawable,
    continuousFeeCredit,
    settlementFeeCbps: [
      settlementFeeCbps0,
      settlementFeeCbps1,
      settlementFeeCbps2,
      settlementFeeCbps3,
      settlementFeeCbps4,
      settlementFeeCbps5,
      settlementFeeCbps6,
    ],
    continuousFee,
    tickSpacing,
  });
}

import type { Hash } from "viem";
import { getChainId, readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { Market, MarketParams } from "../market/index.js";
import { callParameters } from "./_utils.js";
import type { MidnightFetchParams } from "./types.js";

const marketStateFields = (
  state: readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ],
) => ({
  totalUnits: state[0],
  lossFactor: state[1],
  withdrawable: state[2],
  continuousFeeCredit: state[3],
  settlementFeeCbps: [
    state[4],
    state[5],
    state[6],
    state[7],
    state[8],
    state[9],
    state[10],
  ] as const,
  continuousFee: state[11],
  tickSpacing: state[12],
});

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

  return new Market({
    chainId,
    params: marketParams,
    ...marketStateFields(state),
  });
}

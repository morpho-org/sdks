import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client, Hash } from "viem";
import { readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { Market, MarketParams } from "../market/index.js";
import type { MidnightFetchParams } from "./types.js";
import { callParameters, resolveChainId } from "./utils.js";

/**
 * Fetches immutable market params by id.
 *
 * @param client - Viem client used for the read.
 * @param params - Fetch parameters.
 * @returns Market params instance.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @example
 * ```ts
 * import { fetchMarketParams } from "@morpho-org/midnight-sdk";
 *
 * const params = await fetchMarketParams({} as never, {} as never);
 * console.log(params.loanToken);
 * ```
 */
export async function fetchMarketParams(
  client: Client,
  params: MidnightFetchParams & {
    readonly marketId: Hash;
  },
) {
  const chainId = await resolveChainId(client);
  const midnight = getChainAddress(chainId, "midnight");
  const market = await readContract(client, {
    ...callParameters(params),
    address: midnight,
    abi: midnightAbi,
    functionName: "toMarket",
    args: [params.marketId],
  });

  return new MarketParams(market);
}

/**
 * Fetches a hydrated market by id.
 *
 * @param client - Viem client used for the reads.
 * @param params - Fetch parameters.
 * @returns Market instance.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @example
 * ```ts
 * import { fetchMarket } from "@morpho-org/midnight-sdk";
 *
 * const market = await fetchMarket({} as never, {} as never);
 * console.log(market.params.loanToken);
 * ```
 */
export async function fetchMarket(
  client: Client,
  params: MidnightFetchParams & {
    readonly marketId: Hash;
  },
) {
  const chainId = await resolveChainId(client);
  const midnight = getChainAddress(chainId, "midnight");
  const [market, state] = await Promise.all([
    readContract(client, {
      ...callParameters(params),
      address: midnight,
      abi: midnightAbi,
      functionName: "toMarket",
      args: [params.marketId],
    }),
    readContract(client, {
      ...callParameters(params),
      address: midnight,
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
    params: new MarketParams(market),
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

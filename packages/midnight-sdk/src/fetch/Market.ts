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
 * Reads `eth_chainId` only when the viem client has no configured chain id,
 * then reads `Midnight.toMarket(marketId)`.
 *
 * @param client - Viem client used for the read.
 * @param params.marketId - Market id whose immutable params to read.
 * @param params.account - Optional account used as the `from` field for the read.
 * @param params.blockNumber - Optional block number used for the read.
 * @param params.blockTag - Optional block tag used for the read.
 * @param params.stateOverride - Optional state override set used for the read.
 * @returns Market params instance.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @example
 * ```ts
 * import { fetchMarketParams } from "@morpho-org/midnight-sdk";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const params = await fetchMarketParams(client, {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 * });
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
 * Reads `eth_chainId` only when the viem client has no configured chain id,
 * then reads `Midnight.toMarket(marketId)` and `Midnight.marketState(marketId)`.
 *
 * @param client - Viem client used for the reads.
 * @param params.marketId - Market id whose hydrated market state to read.
 * @param params.account - Optional account used as the `from` field for the reads.
 * @param params.blockNumber - Optional block number used for the reads.
 * @param params.blockTag - Optional block tag used for the reads.
 * @param params.stateOverride - Optional state override set used for the reads.
 * @returns Market instance.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @example
 * ```ts
 * import { fetchMarket } from "@morpho-org/midnight-sdk";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const market = await fetchMarket(client, {
 *   marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
 * });
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

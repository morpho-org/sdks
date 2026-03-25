import type { Market, MarketId } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchMarket,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";

export type MarketParameters = {
  marketId: MarketId;
};

export type FetchMarketParameters = Partial<MarketParameters> &
  DeploylessFetchParameters;

export function fetchMarketQueryOptions<config extends Config>(
  config: config,
  parameters: FetchMarketParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn() {
      const { marketId, chainId } = parameters;

      if (!marketId) throw Error("marketId is required");

      return fetchMarket(marketId, config.getClient({ chainId }), parameters);
    },
    queryKey: fetchMarketQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    Market,
    ReadContractErrorType,
    Market,
    FetchMarketQueryKey
  >;
}

// blockNumber and blockTag are intentionally excluded from the query key so that
// TanStack Query reuses a single cache entry per entity instead of creating new
// entries every block (which causes OOM at scale on heavy pages).
//
// For consumers that do need multi-block views (e.g. comparing state across blocks),
// placeholderData: keepPreviousData gives instant-serve UX without multiplying cache entries.
// If hitting cache directly is some day more relevant, include blockNumber and blockTag to the query key
// BUT think of a way to mitigate cache creation/eviction at scale (multiple queries created
// simultaneously at each block when tracking latest).
export function fetchMarketQueryKey({
  marketId,
  chainId,
  deployless,
  account,
  stateOverride,
}: FetchMarketParameters) {
  return [
    "fetchMarket",
    // Ignore all other irrelevant parameters.
    {
      marketId,
      chainId,
      deployless,
      account,
      stateOverride,
    } as FetchMarketParameters,
  ] as const;
}

export type FetchMarketQueryKey = ReturnType<typeof fetchMarketQueryKey>;

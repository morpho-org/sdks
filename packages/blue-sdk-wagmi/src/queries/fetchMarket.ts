import type { Market, MarketId } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchMarket,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";

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
    async queryFn({ queryKey }) {
      const { marketId, chainId, ...parameters } = queryKey[1];
      if (!marketId) throw Error("marketId is required");

      return fetchMarket(marketId, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchMarketQueryKey(parameters),
  } as const satisfies QueryOptions<
    Market,
    ReadContractErrorType,
    Market,
    FetchMarketQueryKey
  >;
}

export function fetchMarketQueryKey({
  marketId,
  chainId,
  blockTag,
  blockNumber,
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
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    } as FetchMarketParameters,
  ] as const;
}

export type FetchMarketQueryKey = ReturnType<typeof fetchMarketQueryKey>;

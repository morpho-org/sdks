import { MarketConfig } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { MarketParameters } from "./fetchMarket.js";

export type MarketConfigParameters = MarketParameters;

export type FetchMarketConfigParameters = Partial<MarketConfigParameters> &
  DeploylessFetchParameters;

export function fetchMarketConfigQueryOptions<config extends Config>(
  config: config,
  parameters: FetchMarketConfigParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { marketId, chainId, ...parameters } = queryKey[1];
      if (!marketId) throw Error("marketId is required");

      return fetchMarketConfig(marketId, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchMarketConfigQueryKey(parameters),
  } as const satisfies QueryOptions<
    MarketConfig,
    ReadContractErrorType,
    MarketConfig,
    FetchMarketConfigQueryKey
  >;
}

export function fetchMarketConfigQueryKey(
  parameters: FetchMarketConfigParameters,
) {
  return ["fetchMarketConfig", parameters] as const;
}

export type FetchMarketConfigQueryKey = ReturnType<
  typeof fetchMarketConfigQueryKey
>;

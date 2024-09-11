import { Market, MarketId } from "@morpho-org/blue-sdk";
import { FetchMarketParameters, fetchMarket } from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";

export type FetchMarketOptions = {
  id?: MarketId;
} & FetchMarketParameters;

export function fetchMarketQueryOptions<config extends Config>(
  config: config,
  options: FetchMarketOptions,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { id, chainId, ...parameters } = queryKey[1];
      if (!id) throw new Error("id is required");

      return fetchMarket(id, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchMarketQueryKey(options),
  } as const satisfies QueryOptions<
    Market,
    ReadContractErrorType,
    Market,
    FetchMarketQueryKey
  >;
}

export function fetchMarketQueryKey(options: FetchMarketOptions) {
  return ["fetchMarket", options] as const;
}

export type FetchMarketQueryKey = ReturnType<typeof fetchMarketQueryKey>;

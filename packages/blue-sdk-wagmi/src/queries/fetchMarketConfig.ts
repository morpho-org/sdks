import type { MarketConfig } from "@morpho-org/blue-sdk";
import {
  type FetchParameters,
  fetchMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import type { MarketParameters } from "./fetchMarket.js";

export type MarketConfigParameters = MarketParameters;

export type FetchMarketConfigParameters = Partial<MarketConfigParameters> &
  Pick<FetchParameters, "chainId">;

export function fetchMarketConfigQueryOptions<config extends Config>(
  config: config,
  parameters: FetchMarketConfigParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { marketId, chainId } = queryKey[1];
      if (!marketId) throw Error("marketId is required");

      return fetchMarketConfig(marketId, config.getClient({ chainId }), {
        chainId,
      });
    },
    queryKey: fetchMarketConfigQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    MarketConfig,
    ReadContractErrorType,
    MarketConfig,
    FetchMarketConfigQueryKey
  >;
}

export function fetchMarketConfigQueryKey({
  marketId,
  chainId,
}: FetchMarketConfigParameters) {
  return [
    "fetchMarketConfig",
    // Ignore all other irrelevant parameters.
    {
      marketId,
      chainId,
    } as FetchMarketConfigParameters,
  ] as const;
}

export type FetchMarketConfigQueryKey = ReturnType<
  typeof fetchMarketConfigQueryKey
>;

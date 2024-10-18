import type { MarketParams } from "@morpho-org/blue-sdk";
import {
  type FetchParameters,
  fetchMarketParams,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import type { MarketParameters } from "./fetchMarket.js";

export type MarketParamsParameters = MarketParameters;

export type FetchMarketParamsParameters = Partial<MarketParamsParameters> &
  Pick<FetchParameters, "chainId">;

export function fetchMarketParamsQueryOptions<config extends Config>(
  config: config,
  parameters: FetchMarketParamsParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { marketId, chainId } = queryKey[1];
      if (!marketId) throw Error("marketId is required");

      return fetchMarketParams(marketId, config.getClient({ chainId }), {
        chainId,
      });
    },
    queryKey: fetchMarketParamsQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    MarketParams,
    ReadContractErrorType,
    MarketParams,
    FetchMarketParamsQueryKey
  >;
}

export function fetchMarketParamsQueryKey({
  marketId,
  chainId,
}: FetchMarketParamsParameters) {
  return [
    "fetchMarketParams",
    // Ignore all other irrelevant parameters.
    {
      marketId,
      chainId,
    } as FetchMarketParamsParameters,
  ] as const;
}

export type FetchMarketParamsQueryKey = ReturnType<
  typeof fetchMarketParamsQueryKey
>;

import type { Market, MarketId } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type MarketParameters,
  fetchMarketQueryOptions,
} from "../queries/fetchMarket.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseMarketParameters } from "./useMarket.js";

export type FetchMarketsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineMarkets>,
> = FetchMarketsParameters &
  UnionOmit<UseMarketParameters<config>, keyof MarketParameters> & {
    combine?: (
      results: UseQueryResult<Market, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseMarketsReturnType<
  TCombinedResult = ReturnType<typeof combineMarkets>,
> = TCombinedResult;

export const combineMarkets = combineIndexedQueries<
  Market,
  [MarketId],
  ReadContractErrorType
>((market) => [market.id]);

export function useMarkets<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineMarkets>,
>({
  marketIds,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
  combine = combineMarkets as any,
  query = {},
  ...parameters
}: UseMarketsParameters<
  config,
  TCombinedResult
>): UseMarketsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(new Set(marketIds), (marketId) => ({
      ...query,
      ...fetchMarketQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        query.staleTime ??
        (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
    })),
    combine,
  });
}

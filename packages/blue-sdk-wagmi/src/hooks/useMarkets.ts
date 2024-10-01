import { Market, MarketId } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { combineIndexedQueries } from "../queries/combineIndexedQueries";
import {
  MarketParameters,
  fetchMarketQueryOptions,
} from "../queries/fetchMarket";
import { useChainId } from "./useChainId";
import { UseMarketParameters } from "./useMarket";

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
  ReadContractErrorType,
  [MarketId]
>((market) => [market.id]);

export function useMarkets<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineMarkets>,
>({
  marketIds,
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
    queries: Array.from(marketIds, (marketId) => ({
      ...query,
      ...fetchMarketQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

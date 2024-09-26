import { MarketConfig, MarketId } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import { fetchMarketConfigQueryOptions } from "../queries/fetchMarketConfig.js";
import { MarketConfigParameters } from "../queries/fetchMarketConfig.js";
import { useChainId } from "./useChainId.js";
import { UseMarketConfigParameters } from "./useMarketConfig.js";

export type FetchMarketConfigsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketConfigsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineMarketConfigs>,
> = FetchMarketConfigsParameters &
  UnionOmit<UseMarketConfigParameters<config>, keyof MarketConfigParameters> & {
    combine?: (
      results: UseQueryResult<MarketConfig, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseMarketConfigsReturnType<
  TCombinedResult = ReturnType<typeof combineMarketConfigs>,
> = TCombinedResult;

export const combineMarketConfigs = combineIndexedQueries<
  MarketConfig,
  ReadContractErrorType,
  [MarketId]
>((market) => [market.id]);

export function useMarketConfigs<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineMarketConfigs>,
>({
  marketIds,
  combine = combineMarketConfigs as any,
  query = {},
  ...parameters
}: UseMarketConfigsParameters<
  config,
  TCombinedResult
>): UseMarketConfigsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(marketIds, (marketId) => ({
      ...query,
      ...fetchMarketConfigQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
    combine,
  });
}

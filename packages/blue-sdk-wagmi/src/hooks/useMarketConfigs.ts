import type { MarketConfig, MarketId } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import { fetchMarketConfigQueryOptions } from "../queries/fetchMarketConfig.js";
import type { MarketConfigParameters } from "../queries/fetchMarketConfig.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseMarketConfigParameters } from "./useMarketConfig.js";

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
  [MarketId],
  ReadContractErrorType
>((market) => [market.id]);

export function useMarketConfigs<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineMarketConfigs>,
>({
  marketIds,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
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
    queries: Array.from(new Set(marketIds), (marketId) => ({
      ...query,
      ...fetchMarketConfigQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    })),
    combine,
  });
}

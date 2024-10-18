import type { MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import { fetchMarketParamsQueryOptions } from "../queries/fetchMarketParams.js";
import type { MarketParamsParameters } from "../queries/fetchMarketParams.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseMarketParamsParameters } from "./useMarketParams.js";

export type FetchMarketsParamsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketsParamsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineMarketsParams>,
> = FetchMarketsParamsParameters &
  UnionOmit<UseMarketParamsParameters<config>, keyof MarketParamsParameters> & {
    combine?: (
      results: UseQueryResult<MarketParams, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseMarketsParamsReturnType<
  TCombinedResult = ReturnType<typeof combineMarketsParams>,
> = TCombinedResult;

export const combineMarketsParams = combineIndexedQueries<
  MarketParams,
  [MarketId],
  ReadContractErrorType
>((market) => [market.id]);

export function useMarketsParams<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineMarketsParams>,
>({
  marketIds,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
  combine = combineMarketsParams as any,
  query = {},
  ...parameters
}: UseMarketsParamsParameters<
  config,
  TCombinedResult
>): UseMarketsParamsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(new Set(marketIds), (marketId) => ({
      ...query,
      ...fetchMarketParamsQueryOptions(config, {
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

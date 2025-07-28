import type { MarketId } from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type MarketParameters,
  fetchMarketQueryOptions,
} from "../queries/fetchMarket.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseMarketParameters, UseMarketReturnType } from "./useMarket.js";

export type FetchMarketsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketsParameters<config extends Config = Config> =
  FetchMarketsParameters &
    UnionOmit<UseMarketParameters<config>, keyof MarketParameters>;

export type UseMarketsReturnType = UseIndexedQueriesReturnType<
  MarketId,
  UseMarketReturnType
>;

export function useMarkets<config extends Config = ResolvedRegister["config"]>({
  marketIds,
  query = {},
  ...parameters
}: UseMarketsParameters<config>) {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueMarketIds = new Set(marketIds);

  const orderedResults = useQueries({
    queries: Array.from(uniqueMarketIds, (marketId) => ({
      ...query,
      ...fetchMarketQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        query.staleTime ??
        (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
    })),
  });

  const result: UseMarketsReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueMarketIds
    .values()
    .filter(isDefined)
    .forEach((marketId, index) => {
      const { data, error, isFetching } = orderedResults[index]!;

      result.data[marketId] = data;
      result.error[marketId] = error as UseMarketReturnType["error"];
      result.isFetching[marketId] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

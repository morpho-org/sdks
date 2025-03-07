import type { MarketId } from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { fetchMarketParamsQueryOptions } from "../queries/fetchMarketParams.js";
import type { MarketParamsParameters } from "../queries/fetchMarketParams.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseMarketParamsParameters,
  UseMarketParamsReturnType,
} from "./useMarketParams.js";

export type FetchMarketsParamsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketsParamsParameters<config extends Config = Config> =
  FetchMarketsParamsParameters &
    UnionOmit<UseMarketParamsParameters<config>, keyof MarketParamsParameters>;

export type UseMarketsParamsReturnType = UseIndexedQueriesReturnType<
  MarketId,
  UseMarketParamsReturnType
>;

export function useMarketsParams<
  config extends Config = ResolvedRegister["config"],
>({
  marketIds,
  query = {},
  ...parameters
}: UseMarketsParamsParameters<config>): UseMarketsParamsReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueMarketIds = new Set(marketIds);

  const orderedResults = useQueries({
    queries: Array.from(uniqueMarketIds, (marketId) => ({
      ...query,
      ...fetchMarketParamsQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    })),
  });

  const result: UseMarketsParamsReturnType = {
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
      result.error[marketId] = error;
      result.isFetching[marketId] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = mergeDeepEqual(resultRef.current, result);

  return resultRef.current;
}

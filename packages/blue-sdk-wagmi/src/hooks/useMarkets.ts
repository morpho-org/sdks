import { Market, MarketId } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  MarketParameters,
  fetchMarketQueryOptions,
} from "../queries/fetchMarket.js";
import { useChainId } from "./useChainId.js";
import { UseMarketParameters, UseMarketReturnType } from "./useMarket.js";

export type FetchMarketsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketsParameters<
  config extends Config = Config,
  selectData = Market,
> = FetchMarketsParameters &
  UnionOmit<UseMarketParameters<config, selectData>, keyof MarketParameters>;

export type UseMarketsReturnType<selectData = Market> =
  UseMarketReturnType<selectData>[];

export function useMarkets<
  config extends Config = ResolvedRegister["config"],
  selectData = Market,
>({
  marketIds,
  query = {},
  ...parameters
}: UseMarketsParameters<config, selectData>): UseMarketsReturnType<selectData> {
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
    })),
  });
}

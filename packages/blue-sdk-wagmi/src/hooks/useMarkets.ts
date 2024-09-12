import { Market, MarketId } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { fetchMarketQueryOptions } from "../query/fetchMarket.js";
import { useChainId } from "./useChainId.js";
import { UseMarketParameters, UseMarketReturnType } from "./useMarket.js";

export type UseMarketsParameters<
  config extends Config = Config,
  selectData = Market,
> = {
  ids: Iterable<MarketId>;
} & Omit<UseMarketParameters<config, selectData>, "id">;

export type UseMarketsReturnType<selectData = Market> =
  UseMarketReturnType<selectData>[];

export function useMarkets<
  config extends Config = ResolvedRegister["config"],
  selectData = Market,
>({
  ids,
  query = {},
  ...parameters
}: UseMarketsParameters<config, selectData>): UseMarketsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(ids, (id) => ({
      ...query,
      ...fetchMarketQueryOptions(config, {
        ...parameters,
        id,
        chainId,
      }),
      enabled: id != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}

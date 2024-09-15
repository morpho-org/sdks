import { Market, MarketId } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionCompute } from "@wagmi/core/internal";
import { MarketConfigParameters } from "src/queries/fetchMarketConfig.js";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { fetchMarketQueryOptions } from "../queries/fetchMarket.js";
import { useChainId } from "./useChainId.js";
import { UseMarketParameters, UseMarketReturnType } from "./useMarket.js";

export type FetchMarketConfigsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketConfigsParameters<
  config extends Config = Config,
  selectData = Market,
> = UnionCompute<
  FetchMarketConfigsParameters &
    Omit<UseMarketParameters<config, selectData>, keyof MarketConfigParameters>
>;

export type UseMarketConfigsReturnType<selectData = Market> =
  UseMarketReturnType<selectData>[];

export function useMarketConfigs<
  config extends Config = ResolvedRegister["config"],
  selectData = Market,
>({
  marketIds,
  query = {},
  ...parameters
}: UseMarketConfigsParameters<
  config,
  selectData
>): UseMarketConfigsReturnType<selectData> {
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

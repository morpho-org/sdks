import { Market, MarketId } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { fetchMarketConfigQueryOptions } from "../queries/fetchMarketConfig.js";
import { MarketConfigParameters } from "../queries/fetchMarketConfig.js";
import { useChainId } from "./useChainId.js";
import {
  UseMarketConfigParameters,
  UseMarketConfigReturnType,
} from "./useMarketConfig.js";

export type FetchMarketConfigsParameters = {
  marketIds: Iterable<MarketId | undefined>;
};

export type UseMarketConfigsParameters<
  config extends Config = Config,
  selectData = Market,
> = FetchMarketConfigsParameters &
  UnionOmit<
    UseMarketConfigParameters<config, selectData>,
    keyof MarketConfigParameters
  >;

export type UseMarketConfigsReturnType<selectData = Market> =
  UseMarketConfigReturnType<selectData>[];

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
      ...fetchMarketConfigQueryOptions(config, {
        ...parameters,
        marketId,
        chainId,
      }),
      enabled: marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}

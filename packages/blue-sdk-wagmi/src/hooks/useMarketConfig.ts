import { MarketConfig } from "@morpho-org/blue-sdk";
import { UnionCompute } from "@wagmi/core/internal";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchMarketConfigParameters,
  FetchMarketConfigQueryKey,
  fetchMarketConfigQueryOptions,
} from "../queries/fetchMarketConfig.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseMarketConfigParameters<
  config extends Config = Config,
  selectData = MarketConfig,
> = UnionCompute<
  FetchMarketConfigParameters &
    ConfigParameter<config> &
    QueryParameter<
      MarketConfig,
      ReadContractErrorType,
      selectData,
      FetchMarketConfigQueryKey
    >
>;

export type UseMarketConfigReturnType<selectData = MarketConfig> =
  UseQueryReturnType<selectData, ReadContractErrorType>;

export function useMarketConfig<
  config extends Config = ResolvedRegister["config"],
  selectData = MarketConfig,
>({
  query = {},
  ...parameters
}: UseMarketConfigParameters<
  config,
  selectData
>): UseMarketConfigReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchMarketConfigQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.marketId != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

import { MarketConfig } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, useQuery } from "wagmi/query";
import {
  FetchMarketConfigParameters,
  FetchMarketConfigQueryKey,
  fetchMarketConfigQueryOptions,
} from "../queries/fetchMarketConfig";
import { ConfigParameter, QueryParameter } from "../types";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";

export type UseMarketConfigParameters<
  config extends Config = Config,
  selectData = MarketConfig,
> = FetchMarketConfigParameters &
  ConfigParameter<config> &
  QueryParameter<
    MarketConfig,
    ReadContractErrorType,
    selectData,
    FetchMarketConfigQueryKey
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
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
  });
}

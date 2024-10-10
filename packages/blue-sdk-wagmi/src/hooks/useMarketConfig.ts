import type { MarketConfig } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchMarketConfigParameters,
  type FetchMarketConfigQueryKey,
  fetchMarketConfigQueryOptions,
} from "../queries/fetchMarketConfig.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

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

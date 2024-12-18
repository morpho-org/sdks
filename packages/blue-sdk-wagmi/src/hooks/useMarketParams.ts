import type { MarketParams } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchMarketParamsParameters,
  type FetchMarketParamsQueryKey,
  fetchMarketParamsQueryOptions,
} from "../queries/fetchMarketParams.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

export type UseMarketParamsParameters<
  config extends Config = Config,
  selectData = MarketParams,
> = FetchMarketParamsParameters &
  ConfigParameter<config> &
  QueryParameter<
    MarketParams,
    ReadContractErrorType,
    selectData,
    FetchMarketParamsQueryKey
  >;

export type UseMarketParamsReturnType<selectData = MarketParams> =
  UseQueryReturnType<selectData, ReadContractErrorType>;

export function useMarketParams<
  config extends Config = ResolvedRegister["config"],
  selectData = MarketParams,
>({
  query = {},
  ...parameters
}: UseMarketParamsParameters<
  config,
  selectData
>): UseMarketParamsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchMarketParamsQueryOptions<config>(config, {
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

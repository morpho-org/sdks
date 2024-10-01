import { Market } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchMarketParameters,
  FetchMarketQueryKey,
  fetchMarketQueryOptions,
} from "../queries/fetchMarket";
import { ConfigParameter, QueryParameter } from "../types";
import { useChainId } from "./useChainId";

export type UseMarketParameters<
  config extends Config = Config,
  selectData = Market,
> = FetchMarketParameters &
  ConfigParameter<config> &
  QueryParameter<
    Market,
    ReadContractErrorType,
    selectData,
    FetchMarketQueryKey
  >;

export type UseMarketReturnType<selectData = Market> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useMarket<
  config extends Config = ResolvedRegister["config"],
  selectData = Market,
>({
  query = {},
  ...parameters
}: UseMarketParameters<config, selectData>): UseMarketReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchMarketQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.marketId != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
    staleTime:
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

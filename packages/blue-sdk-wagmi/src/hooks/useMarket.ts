import type { Market } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchMarketParameters,
  type FetchMarketQueryKey,
  fetchMarketQueryOptions,
} from "../queries/fetchMarket.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

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
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

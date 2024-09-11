import { Market } from "@morpho-org/blue-sdk";
import { UnionCompute } from "@wagmi/core/internal";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchMarketOptions,
  FetchMarketQueryKey,
  fetchMarketQueryOptions,
} from "../query/fetchMarket.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseMarketParameters<
  config extends Config = Config,
  selectData = Market,
> = UnionCompute<
  FetchMarketOptions &
    ConfigParameter<config> &
    QueryParameter<
      Market,
      ReadContractErrorType,
      selectData,
      FetchMarketQueryKey
    >
>;

export type UseMarketReturnType<selectData = Market> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useMarket<
  config extends Config = ResolvedRegister["config"],
  selectData = Market,
>({
  id,
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
    enabled: id != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

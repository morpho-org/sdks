import { Holding } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchHoldingParameters,
  FetchHoldingQueryKey,
  fetchHoldingQueryOptions,
} from "../queries/fetchHolding.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseHoldingParameters<
  config extends Config = Config,
  selectData = Holding,
> = FetchHoldingParameters &
  ConfigParameter<config> &
  QueryParameter<
    Holding,
    ReadContractErrorType,
    selectData,
    FetchHoldingQueryKey
  >;

export type UseHoldingReturnType<selectData = Holding> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useHolding<
  config extends Config = ResolvedRegister["config"],
  selectData = Holding,
>({
  query = {},
  ...parameters
}: UseHoldingParameters<config, selectData>): UseHoldingReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchHoldingQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled:
      parameters.user != null && parameters.token != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

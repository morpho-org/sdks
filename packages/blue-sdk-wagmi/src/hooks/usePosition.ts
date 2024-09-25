import { Position } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchPositionParameters,
  FetchPositionQueryKey,
  fetchPositionQueryOptions,
} from "../queries/fetchPosition.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UsePositionParameters<
  config extends Config = Config,
  selectData = Position,
> = FetchPositionParameters &
  ConfigParameter<config> &
  QueryParameter<
    Position,
    ReadContractErrorType,
    selectData,
    FetchPositionQueryKey
  >;

export type UsePositionReturnType<selectData = Position> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function usePosition<
  config extends Config = ResolvedRegister["config"],
  selectData = Position,
>({
  query = {},
  ...parameters
}: UsePositionParameters<
  config,
  selectData
>): UsePositionReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchPositionQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled:
      parameters.user != null && parameters.marketId != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
    staleTime:
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

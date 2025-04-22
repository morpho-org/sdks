import type { Position } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchPositionParameters,
  type FetchPositionQueryKey,
  fetchPositionQueryOptions,
} from "../queries/fetchPosition.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
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
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

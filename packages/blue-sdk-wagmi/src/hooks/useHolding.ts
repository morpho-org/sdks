import type { Holding } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchHoldingParameters,
  type FetchHoldingQueryKey,
  fetchHoldingQueryOptions,
} from "../queries/fetchHolding.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
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
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    staleTime:
      (query.staleTime ?? parameters.blockNumber != null)
        ? Number.POSITIVE_INFINITY
        : undefined,
  });
}

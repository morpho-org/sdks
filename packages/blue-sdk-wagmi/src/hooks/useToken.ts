import type { Token } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchTokenParameters,
  type FetchTokenQueryKey,
  fetchTokenQueryOptions,
} from "../queries/fetchToken.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

export type UseTokenParameters<
  config extends Config = Config,
  selectData = Token,
> = FetchTokenParameters &
  ConfigParameter<config> &
  QueryParameter<Token, ReadContractErrorType, selectData, FetchTokenQueryKey>;

export type UseTokenReturnType<selectData = Token> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useToken<
  config extends Config = ResolvedRegister["config"],
  selectData = Token,
>({
  query = {},
  ...parameters
}: UseTokenParameters<config, selectData>): UseTokenReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchTokenQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.token != null && query.enabled,
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

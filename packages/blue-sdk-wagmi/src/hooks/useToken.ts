import { Token } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, useQuery } from "wagmi/query";
import {
  FetchTokenParameters,
  FetchTokenQueryKey,
  fetchTokenQueryOptions,
} from "../queries/fetchToken";
import { ConfigParameter, QueryParameter } from "../types";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";

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
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    staleTime:
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

import { Token } from "@morpho-org/blue-sdk";
import { UnionCompute } from "@wagmi/core/internal";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchTokenParameters,
  FetchTokenQueryKey,
  fetchTokenQueryOptions,
} from "../queries/fetchToken.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseTokenParameters<
  config extends Config = Config,
  selectData = Token,
> = UnionCompute<
  FetchTokenParameters &
    ConfigParameter<config> &
    QueryParameter<Token, ReadContractErrorType, selectData, FetchTokenQueryKey>
>;

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
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

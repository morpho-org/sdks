import { User } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchUserParameters,
  FetchUserQueryKey,
  fetchUserQueryOptions,
} from "../queries/fetchUser.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseUserParameters<
  config extends Config = Config,
  selectData = User,
> = FetchUserParameters &
  ConfigParameter<config> &
  QueryParameter<User, ReadContractErrorType, selectData, FetchUserQueryKey>;

export type UseUserReturnType<selectData = User> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useUser<
  config extends Config = ResolvedRegister["config"],
  selectData = User,
>({
  query = {},
  ...parameters
}: UseUserParameters<config, selectData>): UseUserReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchUserQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.user != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
    staleTime:
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

import type { User } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchUserParameters,
  type FetchUserQueryKey,
  fetchUserQueryOptions,
} from "../queries/fetchUser.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
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
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    staleTime:
      (query.staleTime ?? parameters.blockNumber != null)
        ? Number.POSITIVE_INFINITY
        : undefined,
  });
}

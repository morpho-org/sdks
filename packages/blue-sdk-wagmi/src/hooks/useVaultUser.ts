import type { VaultUser } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import { mergeDeepEqual } from "../utils/index.js";

import {
  type FetchVaultUserParameters,
  type FetchVaultUserQueryKey,
  fetchVaultUserQueryOptions,
} from "../queries/fetchVaultUser.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { useChainId } from "./useChainId.js";

export type UseVaultUserParameters<
  config extends Config = Config,
  selectData = VaultUser,
> = FetchVaultUserParameters &
  ConfigParameter<config> &
  QueryParameter<
    VaultUser,
    ReadContractErrorType,
    selectData,
    FetchVaultUserQueryKey
  >;

export type UseVaultUserReturnType<selectData = VaultUser> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useVaultUser<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultUser,
>({
  query = {},
  ...parameters
}: UseVaultUserParameters<
  config,
  selectData
>): UseVaultUserReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultUserQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled:
      parameters.vault != null && parameters.user != null && query.enabled,
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    staleTime:
      (query.staleTime ?? parameters.blockNumber != null)
        ? Number.POSITIVE_INFINITY
        : undefined,
  });
}

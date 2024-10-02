import { VaultConfig } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, useQuery } from "wagmi/query";
import { mergeDeepEqual } from "../utils";

import {
  FetchVaultConfigParameters,
  FetchVaultConfigQueryKey,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig";
import { ConfigParameter, QueryParameter } from "../types";
import { useChainId } from "./useChainId";

export type UseVaultConfigParameters<
  config extends Config = Config,
  selectData = VaultConfig,
> = FetchVaultConfigParameters &
  ConfigParameter<config> &
  QueryParameter<
    VaultConfig,
    ReadContractErrorType,
    selectData,
    FetchVaultConfigQueryKey
  >;

export type UseVaultConfigReturnType<selectData = VaultConfig> =
  UseQueryReturnType<selectData, ReadContractErrorType>;

export function useVaultConfig<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultConfig,
>({
  query = {},
  ...parameters
}: UseVaultConfigParameters<
  config,
  selectData
>): UseVaultConfigReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultConfigQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.vault != null && query.enabled,
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
  });
}

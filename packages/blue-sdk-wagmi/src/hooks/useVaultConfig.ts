import type { VaultConfig } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import { replaceDeepEqual } from "../utils/index.js";

import {
  type FetchVaultConfigParameters,
  type FetchVaultConfigQueryKey,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { useChainId } from "./useChainId.js";

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
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
  });
}

import { VaultConfig } from "@morpho-org/blue-sdk";
import { UnionCompute } from "@wagmi/core/internal";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchVaultConfigParameters,
  FetchVaultConfigQueryKey,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseVaultConfigParameters<
  config extends Config = Config,
  selectData = VaultConfig,
> = UnionCompute<
  FetchVaultConfigParameters &
    ConfigParameter<config> &
    QueryParameter<
      VaultConfig,
      ReadContractErrorType,
      selectData,
      FetchVaultConfigQueryKey
    >
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
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

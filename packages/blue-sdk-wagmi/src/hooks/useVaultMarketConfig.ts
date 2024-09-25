import { VaultMarketConfig } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchVaultMarketConfigParameters,
  FetchVaultMarketConfigQueryKey,
  fetchVaultMarketConfigQueryOptions,
} from "../queries/fetchVaultMarketConfig.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseVaultMarketConfigParameters<
  config extends Config = Config,
  selectData = VaultMarketConfig,
> = FetchVaultMarketConfigParameters &
  ConfigParameter<config> &
  QueryParameter<
    VaultMarketConfig,
    ReadContractErrorType,
    selectData,
    FetchVaultMarketConfigQueryKey
  >;

export type UseVaultMarketConfigReturnType<selectData = VaultMarketConfig> =
  UseQueryReturnType<selectData, ReadContractErrorType>;

export function useVaultMarketConfig<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultMarketConfig,
>({
  query = {},
  ...parameters
}: UseVaultMarketConfigParameters<
  config,
  selectData
>): UseVaultMarketConfigReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultMarketConfigQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled:
      parameters.vault != null && parameters.marketId != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
    staleTime:
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

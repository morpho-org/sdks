import { VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchVaultMarketPublicAllocatorConfigParameters,
  FetchVaultMarketPublicAllocatorConfigQueryKey,
  fetchVaultMarketPublicAllocatorConfigQueryOptions,
} from "../queries/fetchVaultMarketPublicAllocatorConfig.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseVaultMarketPublicAllocatorConfigParameters<
  config extends Config = Config,
  selectData = VaultMarketPublicAllocatorConfig,
> = FetchVaultMarketPublicAllocatorConfigParameters &
  ConfigParameter<config> &
  QueryParameter<
    VaultMarketPublicAllocatorConfig,
    ReadContractErrorType,
    selectData,
    FetchVaultMarketPublicAllocatorConfigQueryKey
  >;

export type UseVaultMarketPublicAllocatorConfigReturnType<
  selectData = VaultMarketPublicAllocatorConfig,
> = UseQueryReturnType<selectData, ReadContractErrorType>;

export function useVaultMarketPublicAllocatorConfig<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultMarketPublicAllocatorConfig,
>({
  query = {},
  ...parameters
}: UseVaultMarketPublicAllocatorConfigParameters<
  config,
  selectData
>): UseVaultMarketPublicAllocatorConfigReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultMarketPublicAllocatorConfigQueryOptions<config>(
    config,
    { ...parameters, chainId },
  );

  return useQuery({
    ...query,
    ...options,
    enabled:
      parameters.vault != null && parameters.marketId != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

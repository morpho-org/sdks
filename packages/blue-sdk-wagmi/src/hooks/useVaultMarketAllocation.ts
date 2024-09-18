import { VaultMarketAllocation } from "@morpho-org/blue-sdk";
import { UnionCompute } from "@wagmi/core/internal";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchVaultMarketAllocationParameters,
  FetchVaultMarketAllocationQueryKey,
  fetchVaultMarketAllocationQueryOptions,
} from "../queries/fetchVaultMarketAllocation.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
import { useChainId } from "./useChainId.js";

export type UseVaultMarketAllocationParameters<
  config extends Config = Config,
  selectData = VaultMarketAllocation,
> = UnionCompute<
  FetchVaultMarketAllocationParameters &
    ConfigParameter<config> &
    QueryParameter<
      VaultMarketAllocation,
      ReadContractErrorType,
      selectData,
      FetchVaultMarketAllocationQueryKey
    >
>;

export type UseVaultMarketAllocationReturnType<
  selectData = VaultMarketAllocation,
> = UseQueryReturnType<selectData, ReadContractErrorType>;

export function useVaultMarketAllocation<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultMarketAllocation,
>({
  query = {},
  ...parameters
}: UseVaultMarketAllocationParameters<
  config,
  selectData
>): UseVaultMarketAllocationReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultMarketAllocationQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled:
      parameters.vault != null && parameters.marketId != null && query.enabled,
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

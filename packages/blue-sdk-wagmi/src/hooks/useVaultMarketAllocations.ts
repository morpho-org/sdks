import { VaultMarketAllocation } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  VaultMarketAllocationParameters,
  fetchVaultMarketAllocationQueryOptions,
} from "../queries/fetchVaultMarketAllocation.js";
import { useChainId } from "./useChainId.js";
import {
  UseVaultMarketAllocationParameters,
  UseVaultMarketAllocationReturnType,
} from "./useVaultMarketAllocation.js";

export type FetchVaultMarketAllocationsParameters = {
  allocations: Iterable<Partial<VaultMarketAllocationParameters>>;
};

export type UseVaultMarketAllocationsParameters<
  config extends Config = Config,
  selectData = VaultMarketAllocation,
> = FetchVaultMarketAllocationsParameters &
  UnionOmit<
    UseVaultMarketAllocationParameters<config, selectData>,
    keyof VaultMarketAllocationParameters
  >;

export type UseVaultMarketAllocationsReturnType<
  selectData = VaultMarketAllocation,
> = UseVaultMarketAllocationReturnType<selectData>[];

export function useVaultMarketAllocations<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultMarketAllocation,
>({
  allocations,
  query = {},
  ...parameters
}: UseVaultMarketAllocationsParameters<
  config,
  selectData
>): UseVaultMarketAllocationsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(allocations, (allocation) => ({
      ...query,
      ...fetchVaultMarketAllocationQueryOptions(config, {
        ...parameters,
        ...allocation,
        chainId,
      }),
      enabled:
        allocation.vault != null &&
        allocation.marketId != null &&
        query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}

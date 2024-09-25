import { VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  VaultMarketPublicAllocatorConfigParameters,
  fetchVaultMarketPublicAllocatorConfigQueryOptions,
} from "../queries/fetchVaultMarketPublicAllocatorConfig.js";
import { useChainId } from "./useChainId.js";
import {
  UseVaultMarketPublicAllocatorConfigParameters,
  UseVaultMarketPublicAllocatorConfigReturnType,
} from "./useVaultMarketPublicAllocatorConfig.js";

export type FetchVaultMarketPublicAllocatorConfigsParameters = {
  configs: Iterable<Partial<VaultMarketPublicAllocatorConfigParameters>>;
};

export type UseVaultMarketPublicAllocatorConfigsParameters<
  config extends Config = Config,
  selectData = VaultMarketPublicAllocatorConfig,
> = FetchVaultMarketPublicAllocatorConfigsParameters &
  UnionOmit<
    UseVaultMarketPublicAllocatorConfigParameters<config, selectData>,
    keyof VaultMarketPublicAllocatorConfigParameters
  >;

export type UseVaultMarketPublicAllocatorConfigsReturnType<
  selectData = VaultMarketPublicAllocatorConfig,
> = UseVaultMarketPublicAllocatorConfigReturnType<selectData>[];

export function useVaultMarketPublicAllocatorConfigs<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultMarketPublicAllocatorConfig,
>({
  configs,
  query = {},
  ...parameters
}: UseVaultMarketPublicAllocatorConfigsParameters<
  config,
  selectData
>): UseVaultMarketPublicAllocatorConfigsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(configs, (vaultMarketPublicAllocatorConfig) => ({
      ...query,
      ...fetchVaultMarketPublicAllocatorConfigQueryOptions(config, {
        ...parameters,
        ...vaultMarketPublicAllocatorConfig,
        chainId,
      }),
      enabled:
        vaultMarketPublicAllocatorConfig.vault != null &&
        vaultMarketPublicAllocatorConfig.marketId != null &&
        query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
  });
}

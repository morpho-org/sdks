import { VaultMarketConfig } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  VaultMarketConfigParameters,
  fetchVaultMarketConfigQueryOptions,
} from "../queries/fetchVaultMarketConfig.js";
import { useChainId } from "./useChainId.js";
import {
  UseVaultMarketConfigParameters,
  UseVaultMarketConfigReturnType,
} from "./useVaultMarketConfig.js";

export type FetchVaultMarketConfigsParameters = {
  configs: Iterable<Partial<VaultMarketConfigParameters>>;
};

export type UseVaultMarketConfigsParameters<
  config extends Config = Config,
  selectData = VaultMarketConfig,
> = FetchVaultMarketConfigsParameters &
  UnionOmit<
    UseVaultMarketConfigParameters<config, selectData>,
    keyof VaultMarketConfigParameters
  >;

export type UseVaultMarketConfigsReturnType<selectData = VaultMarketConfig> =
  UseVaultMarketConfigReturnType<selectData>[];

export function useVaultMarketConfigs<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultMarketConfig,
>({
  configs,
  query = {},
  ...parameters
}: UseVaultMarketConfigsParameters<
  config,
  selectData
>): UseVaultMarketConfigsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(configs, (vaultMarketConfig) => ({
      ...query,
      ...fetchVaultMarketConfigQueryOptions(config, {
        ...parameters,
        ...vaultMarketConfig,
        chainId,
      }),
      enabled:
        vaultMarketConfig.vault != null &&
        vaultMarketConfig.marketId != null &&
        query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
  });
}

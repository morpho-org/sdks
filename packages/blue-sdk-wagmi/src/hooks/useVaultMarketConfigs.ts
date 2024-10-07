import type { MarketId, VaultMarketConfig } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type VaultMarketConfigParameters,
  fetchVaultMarketConfigQueryOptions,
} from "../queries/fetchVaultMarketConfig.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseVaultMarketConfigParameters } from "./useVaultMarketConfig.js";

export type FetchVaultMarketConfigsParameters = {
  configs: Iterable<Partial<VaultMarketConfigParameters>>;
};

export type UseVaultMarketConfigsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineVaultMarketConfigs>,
> = FetchVaultMarketConfigsParameters &
  UnionOmit<
    UseVaultMarketConfigParameters<config>,
    keyof VaultMarketConfigParameters
  > & {
    combine?: (
      results: UseQueryResult<VaultMarketConfig, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseVaultMarketConfigsReturnType<
  TCombinedResult = ReturnType<typeof combineVaultMarketConfigs>,
> = TCombinedResult;

export const combineVaultMarketConfigs = combineIndexedQueries<
  VaultMarketConfig,
  ReadContractErrorType,
  [Address, MarketId]
>((config) => [config.vault, config.marketId]);

export function useVaultMarketConfigs<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaultMarketConfigs>,
>({
  configs,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
  combine = combineVaultMarketConfigs as any,
  query = {},
  ...parameters
}: UseVaultMarketConfigsParameters<
  config,
  TCombinedResult
>): UseVaultMarketConfigsReturnType<TCombinedResult> {
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
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
    combine,
  });
}

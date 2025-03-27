import type { VaultMarketConfig } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchVaultMarketConfigParameters,
  type FetchVaultMarketConfigQueryKey,
  fetchVaultMarketConfigQueryOptions,
} from "../queries/fetchVaultMarketConfig.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
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
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

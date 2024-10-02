import { VaultMarketConfig } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, useQuery } from "wagmi/query";
import {
  FetchVaultMarketConfigParameters,
  FetchVaultMarketConfigQueryKey,
  fetchVaultMarketConfigQueryOptions,
} from "../queries/fetchVaultMarketConfig";
import { ConfigParameter, QueryParameter } from "../types";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";

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
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

import type { VaultV2Adapter } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchVaultV2AdapterParameters,
  type FetchVaultV2AdapterQueryKey,
  fetchVaultV2AdapterQueryOptions,
} from "../queries/fetchVaultV2Adapter.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

export type UseVaultV2AdapterParameters<
  config extends Config = Config,
  selectData = VaultV2Adapter,
> = FetchVaultV2AdapterParameters &
  ConfigParameter<config> &
  QueryParameter<
    VaultV2Adapter,
    ReadContractErrorType,
    selectData,
    FetchVaultV2AdapterQueryKey
  >;

export type UseVaultV2AdapterReturnType<selectData = VaultV2Adapter> =
  UseQueryReturnType<selectData, ReadContractErrorType>;

export function useVaultV2Adapter<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultV2Adapter,
>({
  query = {},
  ...parameters
}: UseVaultV2AdapterParameters<
  config,
  selectData
>): UseVaultV2AdapterReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultV2AdapterQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.vaultV2Adapter != null && query.enabled,
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

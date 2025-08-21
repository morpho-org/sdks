import type { VaultV2 } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchVaultV2Parameters,
  type FetchVaultV2QueryKey,
  fetchVaultV2QueryOptions,
} from "../queries/fetchVaultV2.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

export type UseVaultV2Parameters<
  config extends Config = Config,
  selectData = VaultV2,
> = FetchVaultV2Parameters &
  ConfigParameter<config> &
  QueryParameter<
    VaultV2,
    ReadContractErrorType,
    selectData,
    FetchVaultV2QueryKey
  >;

export type UseVaultV2ReturnType<selectData = VaultV2> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useVaultV2<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultV2,
>({
  query = {},
  ...parameters
}: UseVaultV2Parameters<config, selectData>): UseVaultV2ReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultV2QueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.vaultV2 != null && query.enabled,
    structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

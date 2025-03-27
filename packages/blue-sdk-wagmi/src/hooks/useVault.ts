import type { Vault } from "@morpho-org/blue-sdk";
import type { ReadContractErrorType } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { type UseQueryReturnType, useQuery } from "wagmi/query";
import {
  type FetchVaultParameters,
  type FetchVaultQueryKey,
  fetchVaultQueryOptions,
} from "../queries/fetchVault.js";
import type { ConfigParameter, QueryParameter } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";

export type UseVaultParameters<
  config extends Config = Config,
  selectData = Vault,
> = FetchVaultParameters &
  ConfigParameter<config> &
  QueryParameter<Vault, ReadContractErrorType, selectData, FetchVaultQueryKey>;

export type UseVaultReturnType<selectData = Vault> = UseQueryReturnType<
  selectData,
  ReadContractErrorType
>;

export function useVault<
  config extends Config = ResolvedRegister["config"],
  selectData = Vault,
>({
  query = {},
  ...parameters
}: UseVaultParameters<config, selectData>): UseVaultReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const options = fetchVaultQueryOptions<config>(config, {
    ...parameters,
    chainId,
  });

  return useQuery({
    ...query,
    ...options,
    enabled: parameters.vault != null && query.enabled,
    structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    staleTime:
      query.staleTime ??
      (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
  });
}

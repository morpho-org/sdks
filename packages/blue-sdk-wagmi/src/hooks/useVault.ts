import { Vault } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, useQuery } from "wagmi/query";
import {
  FetchVaultParameters,
  FetchVaultQueryKey,
  fetchVaultQueryOptions,
} from "../queries/fetchVault";
import { ConfigParameter, QueryParameter } from "../types";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";

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
      query.staleTime ?? parameters.blockNumber != null ? Infinity : undefined,
  });
}

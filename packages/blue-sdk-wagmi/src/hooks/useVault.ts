import { Vault } from "@morpho-org/blue-sdk";
import { ReadContractErrorType } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { UseQueryReturnType, structuralSharing, useQuery } from "wagmi/query";
import {
  FetchVaultParameters,
  FetchVaultQueryKey,
  fetchVaultQueryOptions,
} from "../queries/fetchVault.js";
import { ConfigParameter, QueryParameter } from "../types/properties.js";
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
    structuralSharing: query.structuralSharing ?? structuralSharing,
  });
}

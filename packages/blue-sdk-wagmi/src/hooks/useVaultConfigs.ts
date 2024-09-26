import { VaultConfig } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  VaultConfigParameters,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig.js";
import { useChainId } from "./useChainId.js";
import { UseVaultConfigParameters } from "./useVaultConfig.js";

export type FetchVaultConfigsParameters = {
  vaults: Iterable<Address | undefined>;
};

export type UseVaultConfigsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineVaultConfigs>,
> = FetchVaultConfigsParameters &
  UnionOmit<UseVaultConfigParameters<config>, keyof VaultConfigParameters> & {
    combine?: (
      results: UseQueryResult<VaultConfig, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseVaultConfigsReturnType<
  TCombinedResult = ReturnType<typeof combineVaultConfigs>,
> = TCombinedResult;

export const combineVaultConfigs = combineIndexedQueries<
  VaultConfig,
  ReadContractErrorType,
  [Address]
>((config) => [config.address as Address]);

export function useVaultConfigs<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaultConfigs>,
>({
  vaults,
  combine = combineVaultConfigs as any,
  query = {},
  ...parameters
}: UseVaultConfigsParameters<
  config,
  TCombinedResult
>): UseVaultConfigsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(vaults, (vault) => ({
      ...query,
      ...fetchVaultConfigQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
    combine,
  });
}

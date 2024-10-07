import type { VaultConfig } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type VaultConfigParameters,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseVaultConfigParameters } from "./useVaultConfig.js";

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
>((config) => [config.address]);

export function useVaultConfigs<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaultConfigs>,
>({
  vaults,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
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
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
    })),
    combine,
  });
}

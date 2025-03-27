import type { Vault } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type VaultParameters,
  fetchVaultQueryOptions,
} from "../queries/fetchVault.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseVaultParameters } from "./useVault.js";

export type FetchVaultsParameters = {
  vaults: Iterable<Address | undefined>;
};

export type UseVaultsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineVaults>,
> = FetchVaultsParameters &
  UnionOmit<UseVaultParameters<config>, keyof VaultParameters> & {
    combine?: (
      results: UseQueryResult<Vault, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseVaultsReturnType<
  TCombinedResult = ReturnType<typeof combineVaults>,
> = TCombinedResult;

export const combineVaults = combineIndexedQueries<
  Vault,
  [Address],
  ReadContractErrorType
>((vault) => [vault.address]);

export function useVaults<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaults>,
>({
  vaults,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
  combine = combineVaults as any,
  query = {},
  ...parameters
}: UseVaultsParameters<
  config,
  TCombinedResult
>): UseVaultsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(new Set(vaults), (vault) => ({
      ...query,
      ...fetchVaultQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        query.staleTime ??
        (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
    })),
    combine,
  });
}

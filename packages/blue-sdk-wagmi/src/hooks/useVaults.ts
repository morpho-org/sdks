import { Vault } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { combineIndexedQueries } from "../queries/combineIndexedQueries";
import { VaultParameters, fetchVaultQueryOptions } from "../queries/fetchVault";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";
import { UseVaultParameters } from "./useVault";

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
  ReadContractErrorType,
  [Address]
>((vault) => [vault.address]);

export function useVaults<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaults>,
>({
  vaults,
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
    queries: Array.from(vaults, (vault) => ({
      ...query,
      ...fetchVaultQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

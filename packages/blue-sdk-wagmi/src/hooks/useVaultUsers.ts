import { VaultUser } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  VaultUserParameters,
  fetchVaultUserQueryOptions,
} from "../queries/fetchVaultUser.js";
import { useChainId } from "./useChainId.js";
import { UseVaultUserParameters } from "./useVaultUser.js";

export type FetchVaultUsersParameters = {
  vaultUsers: Iterable<Partial<VaultUserParameters>>;
};

export type UseVaultUsersParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineVaultUsers>,
> = FetchVaultUsersParameters &
  UnionOmit<UseVaultUserParameters<config>, keyof VaultUserParameters> & {
    combine?: (
      results: UseQueryResult<VaultUser, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseVaultUsersReturnType<
  TCombinedResult = ReturnType<typeof combineVaultUsers>,
> = TCombinedResult;

export const combineVaultUsers = combineIndexedQueries<
  VaultUser,
  ReadContractErrorType,
  [Address, Address]
>((vaultUser) => [vaultUser.vault, vaultUser.user]);

export function useVaultUsers<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaultUsers>,
>({
  vaultUsers,
  combine = combineVaultUsers as any,
  query = {},
  ...parameters
}: UseVaultUsersParameters<
  config,
  TCombinedResult
>): UseVaultUsersReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(vaultUsers, ({ vault, user }) => ({
      ...query,
      ...fetchVaultUserQueryOptions(config, {
        ...parameters,
        vault,
        user,
        chainId,
      }),
      enabled: vault != null && user != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

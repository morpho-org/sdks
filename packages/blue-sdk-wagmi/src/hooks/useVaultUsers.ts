import type { VaultUser } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type VaultUserParameters,
  fetchVaultUserQueryOptions,
} from "../queries/fetchVaultUser.js";
import { mergeDeepEqual, uniqBy } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseVaultUserParameters } from "./useVaultUser.js";

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
  [Address, Address],
  ReadContractErrorType
>((vaultUser) => [vaultUser.vault, vaultUser.user]);

export function useVaultUsers<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineVaultUsers>,
>({
  vaultUsers,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
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
    queries: uniqBy(vaultUsers, ({ vault, user }) => `${vault},${user}`).map(
      ({ vault, user }) => ({
        ...query,
        ...fetchVaultUserQueryOptions(config, {
          ...parameters,
          vault,
          user,
          chainId,
        }),
        enabled: vault != null && user != null && query.enabled,
        structuralSharing: query.structuralSharing ?? mergeDeepEqual,
        staleTime:
          (query.staleTime ?? parameters.blockNumber != null)
            ? Number.POSITIVE_INFINITY
            : undefined,
      }),
    ),
    combine,
  });
}

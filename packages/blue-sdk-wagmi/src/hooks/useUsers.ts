import { User } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries";
import { UserParameters, fetchUserQueryOptions } from "../queries/fetchUser";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";
import { UseUserParameters } from "./useUser";

export type FetchUsersParameters = {
  users: Iterable<Address | undefined>;
};

export type UseUsersParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineUsers>,
> = FetchUsersParameters &
  UnionOmit<UseUserParameters<config>, keyof UserParameters> & {
    combine?: (
      results: UseQueryResult<User, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseUsersReturnType<
  TCombinedResult = ReturnType<typeof combineUsers>,
> = TCombinedResult;

export const combineUsers = combineIndexedQueries<
  User,
  ReadContractErrorType,
  [Address]
>((user) => [user.address]);

export function useUsers<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineUsers>,
>({
  users,
  combine = combineUsers as any,
  query = {},
  ...parameters
}: UseUsersParameters<
  config,
  TCombinedResult
>): UseUsersReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(users, (user) => ({
      ...query,
      ...fetchUserQueryOptions(config, {
        ...parameters,
        user,
        chainId,
      }),
      enabled: user != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

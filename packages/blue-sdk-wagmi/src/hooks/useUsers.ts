import type { User } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type UserParameters,
  fetchUserQueryOptions,
} from "../queries/fetchUser.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseUserParameters } from "./useUser.js";

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
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
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
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
    combine,
  });
}

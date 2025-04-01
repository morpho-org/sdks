import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type UserParameters,
  fetchUserQueryOptions,
} from "../queries/fetchUser.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseUserParameters, UseUserReturnType } from "./useUser.js";

export type FetchUsersParameters = {
  users: Iterable<Address | undefined>;
};

export type UseUsersParameters<config extends Config = Config> =
  FetchUsersParameters &
    UnionOmit<UseUserParameters<config>, keyof UserParameters>;

export type UseUsersReturnType = UseIndexedQueriesReturnType<
  Address,
  UseUserReturnType
>;

export function useUsers<config extends Config = ResolvedRegister["config"]>({
  users,
  query = {},
  ...parameters
}: UseUsersParameters<config>): UseUsersReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueUsers = new Set(users);

  const orderedResults = useQueries({
    queries: Array.from(uniqueUsers, (user) => ({
      ...query,
      ...fetchUserQueryOptions(config, {
        ...parameters,
        user,
        chainId,
      }),
      enabled: user != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
  });

  const result: UseUsersReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueUsers
    .values()
    .filter(isDefined)
    .forEach((user, index) => {
      const { data, error, isFetching } = orderedResults[index]!;

      result.data[user] = data;
      result.error[user] = error;
      result.isFetching[user] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

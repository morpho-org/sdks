import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type VaultUserParameters,
  fetchVaultUserQueryOptions,
} from "../queries/fetchVaultUser.js";
import type { UseCompositeQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual, uniqBy } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseVaultUserParameters,
  UseVaultUserReturnType,
} from "./useVaultUser.js";

export type FetchVaultUsersParameters = {
  vaultUsers: Iterable<Partial<VaultUserParameters>>;
};

export type UseVaultUsersParameters<config extends Config = Config> =
  FetchVaultUsersParameters &
    UnionOmit<UseVaultUserParameters<config>, keyof VaultUserParameters>;

export type UseVaultUsersReturnType = UseCompositeQueriesReturnType<
  Address,
  Address,
  UseVaultUserReturnType
>;

export function useVaultUsers<
  config extends Config = ResolvedRegister["config"],
>({
  vaultUsers,
  query = {},
  ...parameters
}: UseVaultUsersParameters<config>): UseVaultUsersReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueVaultUsers = uniqBy(
    vaultUsers,
    ({ vault, user }) => `${vault},${user}`,
  );

  const orderedResults = useQueries({
    queries: uniqueVaultUsers.map(({ vault, user }) => ({
      ...query,
      ...fetchVaultUserQueryOptions(config, {
        ...parameters,
        vault,
        user,
        chainId,
      }),
      enabled: vault != null && user != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
  });

  const result: UseVaultUsersReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueVaultUsers.forEach(({ vault, user }, index) => {
    if (vault == null || user == null) return;

    const { data, error, isFetching } = orderedResults[index]!;

    (result.data[vault] ??= {})[user] = data;
    (result.error[vault] ??= {})[user] = error;
    (result.isFetching[vault] ??= {})[user] = isFetching;

    if (isFetching) result.isFetchingAny = true;
  });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

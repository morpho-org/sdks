import { User } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionCompute } from "@wagmi/core/internal";
import { Address } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { UserParameters, fetchUserQueryOptions } from "../queries/fetchUser.js";
import { useChainId } from "./useChainId.js";
import { UseUserParameters, UseUserReturnType } from "./useUser.js";

export type FetchUsersParameters = {
  users: Iterable<Address>;
};

export type UseUsersParameters<
  config extends Config = Config,
  selectData = User,
> = UnionCompute<
  FetchUsersParameters &
    Omit<UseUserParameters<config, selectData>, keyof UserParameters>
>;

export type UseUsersReturnType<selectData = User> =
  UseUserReturnType<selectData>[];

export function useUsers<
  config extends Config = ResolvedRegister["config"],
  selectData = User,
>({
  users,
  query = {},
  ...parameters
}: UseUsersParameters<config, selectData>): UseUsersReturnType<selectData> {
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
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}
import { VaultUser } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  VaultUserParameters,
  fetchVaultUserQueryOptions,
} from "../queries/fetchVaultUser.js";
import { useChainId } from "./useChainId.js";
import {
  UseVaultUserParameters,
  UseVaultUserReturnType,
} from "./useVaultUser.js";

export type FetchVaultUsersParameters = {
  vaultUsers: Iterable<Partial<VaultUserParameters>>;
};

export type UseVaultUsersParameters<
  config extends Config = Config,
  selectData = VaultUser,
> = FetchVaultUsersParameters &
  UnionOmit<
    UseVaultUserParameters<config, selectData>,
    keyof VaultUserParameters
  >;

export type UseVaultUsersReturnType<selectData = VaultUser> =
  UseVaultUserReturnType<selectData>[];

export function useVaultUsers<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultUser,
>({
  vaultUsers,
  query = {},
  ...parameters
}: UseVaultUsersParameters<
  config,
  selectData
>): UseVaultUsersReturnType<selectData> {
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
    })),
  });
}

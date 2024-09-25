import { VaultUser } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchVaultUser,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { UserParameters } from "./fetchUser.js";
import { VaultParameters } from "./fetchVault.js";

export type VaultUserParameters = VaultParameters & UserParameters;

export type FetchVaultUserParameters = Partial<VaultUserParameters> &
  DeploylessFetchParameters;

export function fetchVaultUserQueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultUserParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vault, user, chainId, ...parameters } = queryKey[1];
      if (!vault) throw Error("vault is required");
      if (!user) throw Error("user is required");

      return fetchVaultUser(vault, user, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchVaultUserQueryKey(parameters),
  } as const satisfies QueryOptions<
    VaultUser,
    ReadContractErrorType,
    VaultUser,
    FetchVaultUserQueryKey
  >;
}

export function fetchVaultUserQueryKey({
  vault,
  user,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchVaultUserParameters) {
  return [
    "fetchVaultUser",
    {
      vault,
      user,
      chainId,
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    } as FetchVaultUserParameters,
  ] as const;
}

export type FetchVaultUserQueryKey = ReturnType<typeof fetchVaultUserQueryKey>;

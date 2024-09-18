import { Vault } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchVault,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import { Config } from "wagmi";

export type VaultParameters = {
  vault: Address;
};

export type FetchVaultParameters = Partial<VaultParameters> &
  DeploylessFetchParameters;

export function fetchVaultQueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vault, chainId, ...parameters } = queryKey[1];
      if (!vault) throw Error("vault is required");

      return fetchVault(vault, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchVaultQueryKey(parameters),
  } as const satisfies QueryOptions<
    Vault,
    ReadContractErrorType,
    Vault,
    FetchVaultQueryKey
  >;
}

export function fetchVaultQueryKey(parameters: FetchVaultParameters) {
  return ["fetchVault", parameters] as const;
}

export type FetchVaultQueryKey = ReturnType<typeof fetchVaultQueryKey>;

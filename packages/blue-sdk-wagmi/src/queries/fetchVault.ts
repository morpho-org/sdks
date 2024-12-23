import type { Vault } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchVault,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";

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
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    Vault,
    ReadContractErrorType,
    Vault,
    FetchVaultQueryKey
  >;
}

export function fetchVaultQueryKey({
  vault,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchVaultParameters) {
  return [
    "fetchVault",
    {
      vault,
      chainId,
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    } as FetchVaultParameters,
  ] as const;
}

export type FetchVaultQueryKey = ReturnType<typeof fetchVaultQueryKey>;

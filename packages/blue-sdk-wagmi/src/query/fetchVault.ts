import { Vault } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchVault,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import { Config } from "wagmi";

export type FetchVaultOptions = {
  address?: Address;
} & DeploylessFetchParameters;

export function fetchVaultQueryOptions<config extends Config>(
  config: config,
  options: FetchVaultOptions,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { address, chainId, ...parameters } = queryKey[1];
      if (!address) throw Error("address is required");

      return fetchVault(address, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchVaultQueryKey(options),
  } as const satisfies QueryOptions<
    Vault,
    ReadContractErrorType,
    Vault,
    FetchVaultQueryKey
  >;
}

export function fetchVaultQueryKey(options: FetchVaultOptions) {
  return ["fetchVault", options] as const;
}

export type FetchVaultQueryKey = ReturnType<typeof fetchVaultQueryKey>;

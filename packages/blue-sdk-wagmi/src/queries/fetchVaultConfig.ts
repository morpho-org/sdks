import { VaultConfig } from "@morpho-org/blue-sdk";
import { FetchParameters, fetchVaultConfig } from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { VaultParameters } from "./fetchVault";

export type VaultConfigParameters = VaultParameters;

export type FetchVaultConfigParameters = Partial<VaultConfigParameters> &
  Pick<FetchParameters, "chainId">;

export function fetchVaultConfigQueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultConfigParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vault, chainId, ...parameters } = queryKey[1];
      if (!vault) throw Error("vault is required");

      return fetchVaultConfig(vault, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchVaultConfigQueryKey(parameters),
  } as const satisfies QueryOptions<
    VaultConfig,
    ReadContractErrorType,
    VaultConfig,
    FetchVaultConfigQueryKey
  >;
}

export function fetchVaultConfigQueryKey({
  vault,
  chainId,
}: FetchVaultConfigParameters) {
  return [
    "fetchVaultConfig",
    // Ignore all other irrelevant parameters.
    {
      vault,
      chainId,
    } as FetchVaultConfigParameters,
  ] as const;
}

export type FetchVaultConfigQueryKey = ReturnType<
  typeof fetchVaultConfigQueryKey
>;

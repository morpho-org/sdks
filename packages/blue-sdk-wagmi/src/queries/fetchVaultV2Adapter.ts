import type { VaultV2Adapter } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchVaultV2Adapter,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";

export type VaultV2AdapterParameters = {
  vaultV2Adapter: Address;
};

export type FetchVaultV2AdapterParameters = Partial<VaultV2AdapterParameters> &
  DeploylessFetchParameters;

export function fetchVaultV2AdapterQueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultV2AdapterParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vaultV2Adapter, chainId, ...parameters } = queryKey[1];
      if (!vaultV2Adapter) throw Error("vaultV2Adapter is required");

      return fetchVaultV2Adapter(
        vaultV2Adapter,
        config.getClient({ chainId }),
        {
          chainId,
          ...parameters,
        },
      );
    },
    queryKey: fetchVaultV2AdapterQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    VaultV2Adapter,
    ReadContractErrorType,
    VaultV2Adapter,
    FetchVaultV2AdapterQueryKey
  >;
}

export function fetchVaultV2AdapterQueryKey({
  vaultV2Adapter,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchVaultV2AdapterParameters) {
  return [
    "fetchVaultV2Adapter",
    {
      vaultV2Adapter,
      chainId,
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    } as FetchVaultV2AdapterParameters,
  ] as const;
}

export type FetchVaultV2AdapterQueryKey = ReturnType<
  typeof fetchVaultV2AdapterQueryKey
>;

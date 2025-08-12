import type { VaultV2 } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchVaultV2,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";

export type VaultV2Parameters = {
  vaultV2: Address;
};

export type FetchVaultV2Parameters = Partial<VaultV2Parameters> &
  DeploylessFetchParameters;

export function fetchVaultV2QueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultV2Parameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vaultV2, chainId, ...parameters } = queryKey[1];
      if (!vaultV2) throw Error("vaultV2 is required");

      return fetchVaultV2(vaultV2, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchVaultV2QueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    VaultV2,
    ReadContractErrorType,
    VaultV2,
    FetchVaultV2QueryKey
  >;
}

export function fetchVaultV2QueryKey({
  vaultV2,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchVaultV2Parameters) {
  return [
    "fetchVaultV2",
    {
      vaultV2,
      chainId,
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    } as FetchVaultV2Parameters,
  ] as const;
}

export type FetchVaultV2QueryKey = ReturnType<typeof fetchVaultV2QueryKey>;

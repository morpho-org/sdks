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
    async queryFn() {
      const { vaultV2Adapter, chainId } = parameters;

      if (!vaultV2Adapter) throw Error("vaultV2Adapter is required");

      return fetchVaultV2Adapter(
        vaultV2Adapter,
        config.getClient({ chainId }),
        parameters,
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

// blockNumber and blockTag are intentionally excluded from the query key so that
// TanStack Query reuses a single cache entry per entity instead of creating new
// entries every block (which causes OOM at scale on heavy pages).
//
// For consumers that do need multi-block views (e.g. comparing state across blocks),
// placeholderData: keepPreviousData gives instant-serve UX without multiplying cache entries.
// If hitting cache directly is some day more relevant, include blockNumber and blockTag to the query key
// BUT think of a way to mitigate cache creation/eviction at scale (multiple queries created
// simultaneously at each block when tracking latest).
export function fetchVaultV2AdapterQueryKey({
  vaultV2Adapter,
  chainId,
  deployless,
  account,
  stateOverride,
}: FetchVaultV2AdapterParameters) {
  return [
    "fetchVaultV2Adapter",
    {
      vaultV2Adapter,
      chainId,
      deployless,
      account,
      stateOverride,
    } as FetchVaultV2AdapterParameters,
  ] as const;
}

export type FetchVaultV2AdapterQueryKey = ReturnType<
  typeof fetchVaultV2AdapterQueryKey
>;

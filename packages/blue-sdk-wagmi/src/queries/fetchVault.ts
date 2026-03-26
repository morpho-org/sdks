import type { Vault } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchVault,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";

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
    async queryFn() {
      const { vault, chainId } = parameters;

      if (!vault) throw Error("vault is required");

      return fetchVault(vault, config.getClient({ chainId }), parameters);
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

// blockNumber and blockTag are intentionally excluded from the query key so that
// TanStack Query reuses a single cache entry per entity instead of creating new
// entries every block (which causes OOM at scale on heavy pages).
//
// For consumers that do need multi-block views (e.g. comparing state across blocks),
// placeholderData: keepPreviousData gives instant-serve UX without multiplying cache entries.
// If hitting cache directly is some day more relevant, include blockNumber and blockTag to the query key
// BUT think of a way to mitigate cache creation/eviction at scale (multiple queries created
// simultaneously at each block when tracking latest).
export function fetchVaultQueryKey({
  vault,
  chainId,
  deployless,
  account,
  stateOverride,
}: FetchVaultParameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchVault",
    {
      vault,
      chainId,
      deployless,
      account,
      stateOverride,
    } as FetchVaultParameters,
  ] as const;
}

export type FetchVaultQueryKey = ReturnType<typeof fetchVaultQueryKey>;

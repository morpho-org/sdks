import type { VaultV2 } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchVaultV2,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";

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
    async queryFn() {
      const { vaultV2, chainId } = parameters;

      if (!vaultV2) throw Error("vaultV2 is required");

      return fetchVaultV2(vaultV2, config.getClient({ chainId }), parameters);
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

// blockNumber and blockTag are intentionally excluded from the query key so that
// TanStack Query reuses a single cache entry per entity instead of creating new
// entries every block (which causes OOM at scale on heavy pages).
//
// For consumers that do need multi-block views (e.g. comparing state across blocks),
// placeholderData: keepPreviousData gives instant-serve UX without multiplying cache entries.
// If hitting cache directly is some day more relevant, include blockNumber and blockTag to the query key
// BUT think of a way to mitigate cache creation/eviction at scale (multiple queries created
// simultaneously at each block when tracking latest).
export function fetchVaultV2QueryKey({
  vaultV2,
  chainId,
  deployless,
  account,
  stateOverride,
}: FetchVaultV2Parameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchVaultV2",
    {
      vaultV2,
      chainId,
      deployless,
      account,
      stateOverride,
    } as FetchVaultV2Parameters,
  ] as const;
}

export type FetchVaultV2QueryKey = ReturnType<typeof fetchVaultV2QueryKey>;

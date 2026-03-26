import type { VaultUser } from "@morpho-org/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchVaultUser,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";
import type { UserParameters } from "./fetchUser.js";
import type { VaultParameters } from "./fetchVault.js";

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
    async queryFn() {
      const { vault, user, chainId } = parameters;

      if (!vault) throw Error("vault is required");
      if (user == null) throw Error("user is required");

      return fetchVaultUser(
        vault,
        user,
        config.getClient({ chainId }),
        parameters,
      );
    },
    queryKey: fetchVaultUserQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    VaultUser,
    ReadContractErrorType,
    VaultUser,
    FetchVaultUserQueryKey
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
export function fetchVaultUserQueryKey({
  vault,
  user,
  chainId,
  deployless,
  account,
  stateOverride,
}: FetchVaultUserParameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchVaultUser",
    {
      vault,
      user,
      chainId,
      deployless,
      account,
      stateOverride,
    } as FetchVaultUserParameters,
  ] as const;
}

export type FetchVaultUserQueryKey = ReturnType<typeof fetchVaultUserQueryKey>;

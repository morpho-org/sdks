import type { User } from "@morpho-org/blue-sdk";
import { type FetchParameters, fetchUser } from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";

export type UserParameters = {
  user: Address;
};

export type FetchUserParameters = Partial<UserParameters> & FetchParameters;

export function fetchUserQueryOptions<config extends Config>(
  config: config,
  parameters: FetchUserParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn() {
      const { user, chainId } = parameters;

      if (user == null) throw Error("user is required");

      return fetchUser(user, config.getClient({ chainId }), parameters);
    },
    queryKey: fetchUserQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    User,
    ReadContractErrorType,
    User,
    FetchUserQueryKey
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
export function fetchUserQueryKey({
  user,
  chainId,
  account,
  stateOverride,
}: FetchUserParameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchUser",
    // Ignore all other irrelevant parameters.
    {
      user,
      chainId,
      account,
      stateOverride,
    } as FetchUserParameters,
  ] as const;
}

export type FetchUserQueryKey = ReturnType<typeof fetchUserQueryKey>;

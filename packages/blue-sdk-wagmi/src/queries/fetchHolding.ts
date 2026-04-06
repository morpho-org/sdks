import type { Holding } from "@gfxlabs/blue-sdk";
import {
  type DeploylessFetchParameters,
  fetchHolding,
} from "@gfxlabs/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";
import type { TokenParameters } from "./fetchToken.js";
import type { UserParameters } from "./fetchUser.js";

export type HoldingParameters = UserParameters & TokenParameters;

export type FetchHoldingParameters = Partial<HoldingParameters> &
  DeploylessFetchParameters;

export function fetchHoldingQueryOptions<config extends Config>(
  config: config,
  parameters: FetchHoldingParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn() {
      const { user, token, chainId } = parameters;

      if (user == null) throw Error("user is required");
      if (token == null) throw Error("token is required");

      return fetchHolding(
        user,
        token,
        config.getClient({ chainId }),
        parameters,
      );
    },
    queryKey: fetchHoldingQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    Holding,
    ReadContractErrorType,
    Holding,
    FetchHoldingQueryKey
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
export function fetchHoldingQueryKey({
  user,
  token,
  chainId,
  deployless,
  account,
  stateOverride,
}: FetchHoldingParameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchHolding",
    // Ignore all other irrelevant parameters.
    {
      user,
      token,
      chainId,
      deployless,
      account,
      stateOverride,
    } as FetchHoldingParameters,
  ] as const;
}

export type FetchHoldingQueryKey = ReturnType<typeof fetchHoldingQueryKey>;

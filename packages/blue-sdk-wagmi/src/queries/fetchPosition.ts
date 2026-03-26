import type { Position } from "@morpho-org/blue-sdk";
import { type FetchParameters, fetchPosition } from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";
import type { MarketParameters } from "./fetchMarket.js";
import type { UserParameters } from "./fetchUser.js";

export type PositionParameters = UserParameters & MarketParameters;

export type FetchPositionParameters = Partial<PositionParameters> &
  FetchParameters;

export function fetchPositionQueryOptions<config extends Config>(
  config: config,
  parameters: FetchPositionParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn() {
      const { user, marketId, chainId } = parameters;

      if (user == null) throw Error("user is required");
      if (!marketId) throw Error("marketId is required");

      return fetchPosition(
        user,
        marketId,
        config.getClient({ chainId }),
        parameters,
      );
    },
    queryKey: fetchPositionQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    Position,
    ReadContractErrorType,
    Position,
    FetchPositionQueryKey
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
export function fetchPositionQueryKey({
  user,
  marketId,
  chainId,
  account,
  stateOverride,
}: FetchPositionParameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchPosition",
    // Ignore all other irrelevant parameters.
    {
      user,
      marketId,
      chainId,
      account,
      stateOverride,
    } as FetchPositionParameters,
  ] as const;
}

export type FetchPositionQueryKey = ReturnType<typeof fetchPositionQueryKey>;

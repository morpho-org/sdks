import { Position } from "@morpho-org/blue-sdk";
import { FetchParameters, fetchPosition } from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { MarketParameters } from "./fetchMarket.js";
import { UserParameters } from "./fetchUser.js";

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
    async queryFn({ queryKey }) {
      const { user, marketId, chainId, ...parameters } = queryKey[1];
      if (!user) throw Error("user is required");
      if (!marketId) throw Error("marketId is required");

      return fetchPosition(user, marketId, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchPositionQueryKey(parameters),
  } as const satisfies QueryOptions<
    Position,
    ReadContractErrorType,
    Position,
    FetchPositionQueryKey
  >;
}

export function fetchPositionQueryKey({
  user,
  marketId,
  chainId,
  blockTag,
  blockNumber,
  account,
  stateOverride,
}: FetchPositionParameters) {
  return [
    "fetchPosition",
    // Ignore all other irrelevant parameters.
    {
      user,
      marketId,
      chainId,
      blockTag,
      blockNumber,
      account,
      stateOverride,
    },
  ] as const;
}

export type FetchPositionQueryKey = ReturnType<typeof fetchPositionQueryKey>;
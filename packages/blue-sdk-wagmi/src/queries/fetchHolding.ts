import { Holding } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchHolding,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { TokenParameters } from "./fetchToken.js";
import { UserParameters } from "./fetchUser.js";

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
    async queryFn({ queryKey }) {
      const { user, token, chainId, ...parameters } = queryKey[1];
      if (!user) throw Error("user is required");
      if (!token) throw Error("token is required");

      return fetchHolding(user, token, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchHoldingQueryKey(parameters),
  } as const satisfies QueryOptions<
    Holding,
    ReadContractErrorType,
    Holding,
    FetchHoldingQueryKey
  >;
}

export function fetchHoldingQueryKey({
  user,
  token,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchHoldingParameters) {
  return [
    "fetchHolding",
    // Ignore all other irrelevant parameters.
    {
      user,
      token,
      chainId,
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    },
  ] as const;
}

export type FetchHoldingQueryKey = ReturnType<typeof fetchHoldingQueryKey>;

import { Holding } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchHolding,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import { Config } from "wagmi";

export type FetchHoldingOptions = {
  user?: Address;
  token?: Address;
} & DeploylessFetchParameters;

export function fetchHoldingQueryOptions<config extends Config>(
  config: config,
  options: FetchHoldingOptions,
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
    queryKey: fetchHoldingQueryKey(options),
  } as const satisfies QueryOptions<
    Holding,
    ReadContractErrorType,
    Holding,
    FetchHoldingQueryKey
  >;
}

export function fetchHoldingQueryKey(options: FetchHoldingOptions) {
  return ["fetchHolding", options] as const;
}

export type FetchHoldingQueryKey = ReturnType<typeof fetchHoldingQueryKey>;

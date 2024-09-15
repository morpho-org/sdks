import { Token } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchToken,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import { Config } from "wagmi";

export type TokenParameters = {
  token: Address;
};

export type FetchTokenParameters = Partial<TokenParameters> &
  DeploylessFetchParameters;

export function fetchTokenQueryOptions<config extends Config>(
  config: config,
  parameters: FetchTokenParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { token, chainId, ...parameters } = queryKey[1];
      if (!token) throw Error("token is required");

      return fetchToken(token, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchTokenQueryKey(parameters),
  } as const satisfies QueryOptions<
    Token,
    ReadContractErrorType,
    Token,
    FetchTokenQueryKey
  >;
}

export function fetchTokenQueryKey({
  token,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchTokenParameters) {
  return [
    "fetchToken",
    // Ignore all other irrelevant parameters.
    {
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

export type FetchTokenQueryKey = ReturnType<typeof fetchTokenQueryKey>;

import type { User } from "@morpho-org/blue-sdk";
import { type FetchParameters, fetchUser } from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";

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

export function fetchUserQueryKey({
  user,
  chainId,
  account,
  stateOverride,
}: FetchUserParameters) {
  return [
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

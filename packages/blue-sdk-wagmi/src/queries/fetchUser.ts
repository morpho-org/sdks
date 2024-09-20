import { User } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchUser,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { Address, ReadContractErrorType } from "viem";
import { Config } from "wagmi";

export type UserParameters = {
  user: Address;
};

export type FetchUserParameters = Partial<UserParameters> &
  DeploylessFetchParameters;

export function fetchUserQueryOptions<config extends Config>(
  config: config,
  parameters: FetchUserParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { user, chainId, ...parameters } = queryKey[1];
      if (!user) throw Error("user is required");

      return fetchUser(user, config.getClient({ chainId }), {
        chainId,
        ...parameters,
      });
    },
    queryKey: fetchUserQueryKey(parameters),
  } as const satisfies QueryOptions<
    User,
    ReadContractErrorType,
    User,
    FetchUserQueryKey
  >;
}

export function fetchUserQueryKey(parameters: FetchUserParameters) {
  return ["fetchUser", parameters] as const;
}

export type FetchUserQueryKey = ReturnType<typeof fetchUserQueryKey>;

import { Token } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  TokenParameters,
  fetchTokenQueryOptions,
} from "../queries/fetchToken.js";
import { useChainId } from "./useChainId.js";
import { UseTokenParameters } from "./useToken.js";

export type FetchTokensParameters = {
  tokens: Iterable<Address | undefined>;
};

export type UseTokensParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineTokens>,
> = FetchTokensParameters &
  UnionOmit<UseTokenParameters<config>, keyof TokenParameters> & {
    combine?: (
      results: UseQueryResult<Token, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseTokensReturnType<
  TCombinedResult = ReturnType<typeof combineTokens>,
> = TCombinedResult;

export const combineTokens = combineIndexedQueries<
  Token,
  ReadContractErrorType,
  [Address]
>((token) => [token.address as Address]);

export function useTokens<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineTokens>,
>({
  tokens,
  combine = combineTokens as any,
  query = {},
  ...parameters
}: UseTokensParameters<
  config,
  TCombinedResult
>): UseTokensReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(tokens, (token) => ({
      ...query,
      ...fetchTokenQueryOptions(config, {
        ...parameters,
        token,
        chainId,
      }),
      enabled: token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

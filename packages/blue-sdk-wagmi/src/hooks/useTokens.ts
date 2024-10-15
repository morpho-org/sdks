import type { Token } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type TokenParameters,
  fetchTokenQueryOptions,
} from "../queries/fetchToken.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseTokenParameters } from "./useToken.js";

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
  [Address],
  ReadContractErrorType
>((token) => [token.address]);

export function useTokens<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineTokens>,
>({
  tokens,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
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
    queries: Array.from(new Set(tokens), (token) => ({
      ...query,
      ...fetchTokenQueryOptions(config, {
        ...parameters,
        token,
        chainId,
      }),
      enabled: token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
    combine,
  });
}

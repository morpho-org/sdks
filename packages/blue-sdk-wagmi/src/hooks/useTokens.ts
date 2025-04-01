import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type TokenParameters,
  fetchTokenQueryOptions,
} from "../queries/fetchToken.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseTokenParameters, UseTokenReturnType } from "./useToken.js";

export type FetchTokensParameters = {
  tokens: Iterable<Address | undefined>;
};

export type UseTokensParameters<config extends Config = Config> =
  FetchTokensParameters &
    UnionOmit<UseTokenParameters<config>, keyof TokenParameters>;

export type UseTokensReturnType = UseIndexedQueriesReturnType<
  Address,
  UseTokenReturnType
>;

export function useTokens<config extends Config = ResolvedRegister["config"]>({
  tokens,
  query = {},
  ...parameters
}: UseTokensParameters<config>): UseTokensReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueTokens = new Set(tokens);

  const orderedResults = useQueries({
    queries: Array.from(uniqueTokens, (token) => ({
      ...query,
      ...fetchTokenQueryOptions(config, {
        ...parameters,
        token,
        chainId,
      }),
      enabled: token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
  });

  const result: UseTokensReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueTokens
    .values()
    .filter(isDefined)
    .forEach((token, index) => {
      const { data, error, isFetching } = orderedResults[index]!;

      result.data[token] = data;
      result.error[token] = error;
      result.isFetching[token] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

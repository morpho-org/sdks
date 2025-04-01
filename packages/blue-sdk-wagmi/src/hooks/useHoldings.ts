import { useQueries } from "@tanstack/react-query";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { useRef } from "react";
import {
  type HoldingParameters,
  fetchHoldingQueryOptions,
} from "../queries/fetchHolding.js";
import type { UseCompositeQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual, uniqBy } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseHoldingParameters,
  UseHoldingReturnType,
} from "./useHolding.js";

export type FetchHoldingsParameters = {
  holdings: Iterable<Partial<HoldingParameters>>;
};

export type UseHoldingsParameters<config extends Config = Config> =
  FetchHoldingsParameters &
    UnionOmit<UseHoldingParameters<config>, keyof HoldingParameters>;

export type UseHoldingsReturnType = UseCompositeQueriesReturnType<
  Address,
  Address,
  UseHoldingReturnType
>;

export function useHoldings<
  config extends Config = ResolvedRegister["config"],
>({
  holdings,
  query = {},
  ...parameters
}: UseHoldingsParameters<config>): UseHoldingsReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueHoldings = uniqBy(
    holdings,
    ({ user, token }) => `${user},${token}`,
  );

  const orderedResults = useQueries({
    queries: uniqueHoldings.map((holding) => ({
      ...query,
      ...fetchHoldingQueryOptions(config, {
        ...parameters,
        ...holding,
        chainId,
      }),
      enabled: holding.user != null && holding.token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
  });

  const result: UseHoldingsReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueHoldings.forEach(({ user, token }, index) => {
    if (user == null || token == null) return;

    const { data, error, isFetching } = orderedResults[index]!;

    (result.data[user] ??= {})[token] = data;
    (result.error[user] ??= {})[token] = error;
    (result.isFetching[user] ??= {})[token] = isFetching;

    if (isFetching) result.isFetchingAny = true;
  });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

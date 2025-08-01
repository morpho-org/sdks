import type { MarketId } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type PositionParameters,
  fetchPositionQueryOptions,
} from "../queries/fetchPosition.js";
import type { UseCompositeQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual, uniqBy } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UsePositionParameters,
  UsePositionReturnType,
} from "./usePosition.js";

export type FetchPositionsParameters = {
  positions: Iterable<Partial<PositionParameters>>;
};

export type UsePositionsParameters<config extends Config = Config> =
  FetchPositionsParameters &
    UnionOmit<UsePositionParameters<config>, keyof PositionParameters>;

export type UsePositionsReturnType = UseCompositeQueriesReturnType<
  Address,
  MarketId,
  UsePositionReturnType
>;

export function usePositions<
  config extends Config = ResolvedRegister["config"],
>({
  positions,
  query = {},
  ...parameters
}: UsePositionsParameters<config>): UsePositionsReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniquePositions = uniqBy(
    positions,
    ({ user, marketId }) => `${user},${marketId}`,
  );

  const orderedResults = useQueries({
    queries: uniquePositions.map((position) => ({
      ...query,
      ...fetchPositionQueryOptions(config, {
        ...parameters,
        ...position,
        chainId,
      }),
      enabled:
        position.user != null && position.marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        query.staleTime ??
        (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
    })),
  });

  const result: UsePositionsReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniquePositions.forEach(({ user, marketId }, index) => {
    if (user == null || marketId == null) return;

    const { data, error, isFetching } = orderedResults[index]!;

    (result.data[user] ??= {})[marketId] = data;
    (result.error[user] ??= {})[marketId] =
      error as UsePositionReturnType["error"];
    (result.isFetching[user] ??= {})[marketId] = isFetching;

    if (isFetching) result.isFetchingAny = true;
  });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

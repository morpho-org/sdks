import type { MarketId, Position } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type PositionParameters,
  fetchPositionQueryOptions,
} from "../queries/fetchPosition.js";
import { mergeDeepEqual, uniqBy } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UsePositionParameters } from "./usePosition.js";

export type FetchPositionsParameters = {
  positions: Iterable<Partial<PositionParameters>>;
};

export type UsePositionsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combinePositions>,
> = FetchPositionsParameters &
  UnionOmit<UsePositionParameters<config>, keyof PositionParameters> & {
    combine?: (
      results: UseQueryResult<Position, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UsePositionsReturnType<
  TCombinedResult = ReturnType<typeof combinePositions>,
> = TCombinedResult;

export const combinePositions = combineIndexedQueries<
  Position,
  [Address, MarketId],
  ReadContractErrorType
>((position) => [position.user, position.marketId]);

export function usePositions<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combinePositions>,
>({
  positions,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
  combine = combinePositions as any,
  query = {},
  ...parameters
}: UsePositionsParameters<
  config,
  TCombinedResult
>): UsePositionsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: uniqBy(
      positions,
      ({ user, marketId }) => `${user},${marketId}`,
    ).map((position) => ({
      ...query,
      ...fetchPositionQueryOptions(config, {
        ...parameters,
        ...position,
        chainId,
      }),
      enabled:
        position.user != null && position.marketId != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
    combine,
  });
}

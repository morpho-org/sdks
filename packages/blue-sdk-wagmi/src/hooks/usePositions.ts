import { MarketId, Position } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries";
import {
  PositionParameters,
  fetchPositionQueryOptions,
} from "../queries/fetchPosition";
import { mergeDeepEqual } from "../utils";
import { useChainId } from "./useChainId";
import { UsePositionParameters } from "./usePosition";

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
  ReadContractErrorType,
  [Address, MarketId]
>((position) => [position.user, position.marketId]);

export function usePositions<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combinePositions>,
>({
  positions,
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
    queries: Array.from(positions, (position) => ({
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
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

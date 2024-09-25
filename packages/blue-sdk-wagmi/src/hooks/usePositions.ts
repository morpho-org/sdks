import { Position } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  PositionParameters,
  fetchPositionQueryOptions,
} from "../queries/fetchPosition.js";
import { useChainId } from "./useChainId.js";
import { UsePositionParameters, UsePositionReturnType } from "./usePosition.js";

export type FetchPositionsParameters = {
  positions: Iterable<Partial<PositionParameters>>;
};

export type UsePositionsParameters<
  config extends Config = Config,
  selectData = Position,
> = FetchPositionsParameters &
  UnionOmit<
    UsePositionParameters<config, selectData>,
    keyof PositionParameters
  >;

export type UsePositionsReturnType<selectData = Position> =
  UsePositionReturnType<selectData>[];

export function usePositions<
  config extends Config = ResolvedRegister["config"],
  selectData = Position,
>({
  positions,
  query = {},
  ...parameters
}: UsePositionsParameters<
  config,
  selectData
>): UsePositionsReturnType<selectData> {
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
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
  });
}

import type { Holding } from "@morpho-org/blue-sdk";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { Address, ReadContractErrorType, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";

import { combineIndexedQueries } from "../queries/combineIndexedQueries.js";
import {
  type HoldingParameters,
  fetchHoldingQueryOptions,
} from "../queries/fetchHolding.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseHoldingParameters } from "./useHolding.js";

export type FetchHoldingsParameters = {
  holdings: Iterable<Partial<HoldingParameters>>;
};

export type UseHoldingsParameters<
  config extends Config = Config,
  TCombinedResult = ReturnType<typeof combineHoldings>,
> = FetchHoldingsParameters &
  UnionOmit<UseHoldingParameters<config>, keyof HoldingParameters> & {
    combine?: (
      results: UseQueryResult<Holding, ReadContractErrorType>[],
    ) => TCombinedResult;
  };

export type UseHoldingsReturnType<
  TCombinedResult = ReturnType<typeof combineHoldings>,
> = TCombinedResult;

export const combineHoldings = combineIndexedQueries<
  Holding,
  ReadContractErrorType,
  [Address, Address]
>((holding) => [holding.user, holding.token]);

export function useHoldings<
  config extends Config = ResolvedRegister["config"],
  TCombinedResult = ReturnType<typeof combineHoldings>,
>({
  holdings,
  // biome-ignore lint/suspicious/noExplicitAny: compatible default type
  combine = combineHoldings as any,
  query = {},
  ...parameters
}: UseHoldingsParameters<
  config,
  TCombinedResult
>): UseHoldingsReturnType<TCombinedResult> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(holdings, (holding) => ({
      ...query,
      ...fetchHoldingQueryOptions(config, {
        ...parameters,
        ...holding,
        chainId,
      }),
      enabled: holding.user != null && holding.token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
    combine,
  });
}

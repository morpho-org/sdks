import { Holding } from "@morpho-org/blue-sdk";
import { UseQueryResult, useQueries } from "@tanstack/react-query";
import { Address, ReadContractErrorType, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { combineIndexedQueries } from "../queries/combineIndexedQueries";
import {
  HoldingParameters,
  fetchHoldingQueryOptions,
} from "../queries/fetchHolding";
import { useChainId } from "./useChainId";
import { UseHoldingParameters } from "./useHolding";

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
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
    combine,
  });
}

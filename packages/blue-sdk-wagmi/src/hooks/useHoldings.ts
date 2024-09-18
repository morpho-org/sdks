import { Holding } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  HoldingParameters,
  fetchHoldingQueryOptions,
} from "../queries/fetchHolding.js";
import { useChainId } from "./useChainId.js";
import { UseHoldingParameters, UseHoldingReturnType } from "./useHolding.js";

export type UseHoldingsParameters<
  config extends Config = Config,
  selectData = Holding,
> = {
  holdings: Iterable<Partial<HoldingParameters>>;
} & Omit<UseHoldingParameters<config, selectData>, keyof HoldingParameters>;

export type UseHoldingsReturnType<selectData = Holding> =
  UseHoldingReturnType<selectData>[];

export function useHoldings<
  config extends Config = ResolvedRegister["config"],
  selectData = Holding,
>({
  holdings,
  query = {},
  ...parameters
}: UseHoldingsParameters<
  config,
  selectData
>): UseHoldingsReturnType<selectData> {
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
    })),
  });
}

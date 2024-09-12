import { Holding } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Address } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { fetchHoldingQueryOptions } from "../query/fetchHolding.js";
import { useChainId } from "./useChainId.js";
import { UseHoldingParameters, UseHoldingReturnType } from "./useHolding.js";

export type UseHoldingsParameters<
  config extends Config = Config,
  selectData = Holding,
> = {
  holdings: Iterable<{ user: Address; token: Address }>;
} & Omit<UseHoldingParameters<config, selectData>, "id">;

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
    queries: Array.from(holdings, ({ user, token }) => ({
      ...query,
      ...fetchHoldingQueryOptions(config, {
        ...parameters,
        user,
        token,
        chainId,
      }),
      enabled: user != null && token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}

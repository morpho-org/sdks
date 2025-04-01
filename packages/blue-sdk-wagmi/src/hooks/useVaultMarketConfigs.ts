import type { MarketId } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type VaultMarketConfigParameters,
  fetchVaultMarketConfigQueryOptions,
} from "../queries/fetchVaultMarketConfig.js";
import type { UseCompositeQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual, uniqBy } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseVaultMarketConfigParameters,
  UseVaultMarketConfigReturnType,
} from "./useVaultMarketConfig.js";

export type FetchVaultMarketConfigsParameters = {
  configs: Iterable<Partial<VaultMarketConfigParameters>>;
};

export type UseVaultMarketConfigsParameters<config extends Config = Config> =
  FetchVaultMarketConfigsParameters &
    UnionOmit<
      UseVaultMarketConfigParameters<config>,
      keyof VaultMarketConfigParameters
    >;

export type UseVaultMarketConfigsReturnType = UseCompositeQueriesReturnType<
  Address,
  MarketId,
  UseVaultMarketConfigReturnType
>;

export function useVaultMarketConfigs<
  config extends Config = ResolvedRegister["config"],
>({
  configs,
  query = {},
  ...parameters
}: UseVaultMarketConfigsParameters<config>): UseVaultMarketConfigsReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueVaultMarketConfigs = uniqBy(
    configs,
    ({ vault, marketId }) => `${vault},${marketId}`,
  );

  const orderedResults = useQueries({
    queries: uniqueVaultMarketConfigs.map((vaultMarketConfig) => ({
      ...query,
      ...fetchVaultMarketConfigQueryOptions(config, {
        ...parameters,
        ...vaultMarketConfig,
        chainId,
      }),
      enabled:
        vaultMarketConfig.vault != null &&
        vaultMarketConfig.marketId != null &&
        query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
  });

  const result: UseVaultMarketConfigsReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueVaultMarketConfigs.forEach(({ vault, marketId }, index) => {
    if (vault == null || marketId == null) return;

    const { data, error, isFetching } = orderedResults[index]!;

    (result.data[vault] ??= {})[marketId] = data;
    (result.error[vault] ??= {})[marketId] = error;
    (result.isFetching[vault] ??= {})[marketId] = isFetching;

    if (isFetching) result.isFetchingAny = true;
  });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

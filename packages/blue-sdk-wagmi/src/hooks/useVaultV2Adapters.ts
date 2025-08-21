import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type VaultV2AdapterParameters,
  fetchVaultV2AdapterQueryOptions,
} from "../queries/fetchVaultV2Adapter.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseVaultV2AdapterParameters,
  UseVaultV2AdapterReturnType,
} from "./useVaultV2Adapter.js";

export type FetchVaultV2AdaptersParameters = {
  vaultV2Adapters: Iterable<Address | undefined>;
};

export type UseVaultV2AdaptersParameters<config extends Config = Config> =
  FetchVaultV2AdaptersParameters &
    UnionOmit<
      UseVaultV2AdapterParameters<config>,
      keyof VaultV2AdapterParameters
    >;

export type UseVaultV2AdaptersReturnType = UseIndexedQueriesReturnType<
  Address,
  UseVaultV2AdapterReturnType
>;

export function useVaultV2Adapters<
  config extends Config = ResolvedRegister["config"],
>({
  vaultV2Adapters,
  query = {},
  ...parameters
}: UseVaultV2AdaptersParameters<config>): UseVaultV2AdaptersReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueVaultV2Adapters = new Set(vaultV2Adapters);

  const orderedResults = useQueries({
    queries: Array.from(uniqueVaultV2Adapters, (vaultV2Adapter) => ({
      ...query,
      ...fetchVaultV2AdapterQueryOptions(config, {
        ...parameters,
        vaultV2Adapter,
        chainId,
      }),
      enabled: vaultV2Adapter != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        query.staleTime ??
        (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
    })),
  });

  const result: UseVaultV2AdaptersReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueVaultV2Adapters
    .values()
    .filter(isDefined)
    .forEach((vaultV2, index) => {
      const { data, error, isFetching } = orderedResults[index]!;

      result.data[vaultV2] = data;
      result.error[vaultV2] = error;
      result.isFetching[vaultV2] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

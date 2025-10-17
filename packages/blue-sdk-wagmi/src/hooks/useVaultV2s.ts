import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type VaultV2Parameters,
  fetchVaultV2QueryOptions,
} from "../queries/fetchVaultV2.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseVaultV2Parameters,
  UseVaultV2ReturnType,
} from "./useVaultV2.js";

export type FetchVaultV2sParameters = {
  vaultV2s: Iterable<Address | undefined>;
};

export type UseVaultV2sParameters<config extends Config = Config> =
  FetchVaultV2sParameters &
    UnionOmit<UseVaultV2Parameters<config>, keyof VaultV2Parameters>;

export type UseVaultV2sReturnType = UseIndexedQueriesReturnType<
  Address,
  UseVaultV2ReturnType
>;

export function useVaultV2s<
  config extends Config = ResolvedRegister["config"],
>({
  vaultV2s,
  query = {},
  ...parameters
}: UseVaultV2sParameters<config>): UseVaultV2sReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueVaultV2s = new Set(vaultV2s);

  const orderedResults = useQueries({
    queries: Array.from(uniqueVaultV2s, (vaultV2) => ({
      ...query,
      ...fetchVaultV2QueryOptions(config, {
        ...parameters,
        vaultV2,
        chainId,
      }),
      enabled: vaultV2 != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
      staleTime:
        query.staleTime ??
        (parameters.blockNumber != null ? Number.POSITIVE_INFINITY : undefined),
    })),
  });

  const result: UseVaultV2sReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueVaultV2s
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

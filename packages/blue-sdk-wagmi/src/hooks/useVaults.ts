import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type VaultParameters,
  fetchVaultQueryOptions,
} from "../queries/fetchVault.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { mergeDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type { UseVaultParameters, UseVaultReturnType } from "./useVault.js";

export type FetchVaultsParameters = {
  vaults: Iterable<Address | undefined>;
};

export type UseVaultsParameters<config extends Config = Config> =
  FetchVaultsParameters &
    UnionOmit<UseVaultParameters<config>, keyof VaultParameters>;

export type UseVaultsReturnType = UseIndexedQueriesReturnType<
  Address,
  UseVaultReturnType
>;

export function useVaults<config extends Config = ResolvedRegister["config"]>({
  vaults,
  query = {},
  ...parameters
}: UseVaultsParameters<config>): UseVaultsReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueVaults = new Set(vaults);

  const orderedResults = useQueries({
    queries: Array.from(uniqueVaults, (vault) => ({
      ...query,
      ...fetchVaultQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? mergeDeepEqual,
      staleTime:
        (query.staleTime ?? parameters.blockNumber != null)
          ? Number.POSITIVE_INFINITY
          : undefined,
    })),
  });

  const result: UseVaultsReturnType = {
    data: {},
    error: {},
    isFetching: {},
    isFetchingAny: false,
  };

  uniqueVaults
    .values()
    .filter(isDefined)
    .forEach((vault, index) => {
      const { data, error, isFetching } = orderedResults[index]!;

      result.data[vault] = data;
      result.error[vault] = error;
      result.isFetching[vault] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = mergeDeepEqual(resultRef.current, result);

  return resultRef.current;
}

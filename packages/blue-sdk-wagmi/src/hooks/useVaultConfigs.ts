import { isDefined } from "@morpho-org/morpho-ts";
import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import type { Address, UnionOmit } from "viem";
import { type Config, type ResolvedRegister, useConfig } from "wagmi";
import {
  type VaultConfigParameters,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig.js";
import type { UseIndexedQueriesReturnType } from "../types/index.js";
import { replaceDeepEqual } from "../utils/index.js";
import { useChainId } from "./useChainId.js";
import type {
  UseVaultConfigParameters,
  UseVaultConfigReturnType,
} from "./useVaultConfig.js";

export type FetchVaultConfigsParameters = {
  vaults: Iterable<Address | undefined>;
};

export type UseVaultConfigsParameters<config extends Config = Config> =
  FetchVaultConfigsParameters &
    UnionOmit<UseVaultConfigParameters<config>, keyof VaultConfigParameters>;

export type UseVaultConfigsReturnType = UseIndexedQueriesReturnType<
  Address,
  UseVaultConfigReturnType
>;

export function useVaultConfigs<
  config extends Config = ResolvedRegister["config"],
>({
  vaults,
  query = {},
  ...parameters
}: UseVaultConfigsParameters<config>): UseVaultConfigsReturnType {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  const uniqueVaults = new Set(vaults);

  const orderedResults = useQueries({
    queries: Array.from(uniqueVaults, (vault) => ({
      ...query,
      ...fetchVaultConfigQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? replaceDeepEqual,
    })),
  });

  const result: UseVaultConfigsReturnType = {
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
      result.error[vault] = error as UseVaultConfigReturnType["error"];
      result.isFetching[vault] = isFetching;

      if (isFetching) result.isFetchingAny = true;
    });

  const resultRef = useRef(result);
  resultRef.current = replaceDeepEqual(resultRef.current, result);

  return resultRef.current;
}

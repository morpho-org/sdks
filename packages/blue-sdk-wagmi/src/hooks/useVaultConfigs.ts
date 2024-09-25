import { VaultConfig } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Address, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  VaultConfigParameters,
  fetchVaultConfigQueryOptions,
} from "../queries/fetchVaultConfig.js";
import { useChainId } from "./useChainId.js";
import {
  UseVaultConfigParameters,
  UseVaultConfigReturnType,
} from "./useVaultConfig.js";

export type FetchVaultConfigsParameters = {
  vaults: Iterable<Address | undefined>;
};

export type UseVaultConfigsParameters<
  config extends Config = Config,
  selectData = VaultConfig,
> = FetchVaultConfigsParameters &
  UnionOmit<
    UseVaultConfigParameters<config, selectData>,
    keyof VaultConfigParameters
  >;

export type UseVaultConfigsReturnType<selectData = VaultConfig> =
  UseVaultConfigReturnType<selectData>[];

export function useVaultConfigs<
  config extends Config = ResolvedRegister["config"],
  selectData = VaultConfig,
>({
  vaults,
  query = {},
  ...parameters
}: UseVaultConfigsParameters<
  config,
  selectData
>): UseVaultConfigsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(vaults, (vault) => ({
      ...query,
      ...fetchVaultConfigQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}

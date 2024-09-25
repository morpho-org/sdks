import { Vault } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Address, UnionOmit } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  VaultParameters,
  fetchVaultQueryOptions,
} from "../queries/fetchVault.js";
import { useChainId } from "./useChainId.js";
import { UseVaultParameters, UseVaultReturnType } from "./useVault.js";

export type FetchVaultsParameters = {
  vaults: Iterable<Address | undefined>;
};

export type UseVaultsParameters<
  config extends Config = Config,
  selectData = Vault,
> = FetchVaultsParameters &
  UnionOmit<UseVaultParameters<config, selectData>, keyof VaultParameters>;

export type UseVaultsReturnType<selectData = Vault> =
  UseVaultReturnType<selectData>[];

export function useVaults<
  config extends Config = ResolvedRegister["config"],
  selectData = Vault,
>({
  vaults,
  query = {},
  ...parameters
}: UseVaultsParameters<config, selectData>): UseVaultsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(vaults, (vault) => ({
      ...query,
      ...fetchVaultQueryOptions(config, {
        ...parameters,
        vault,
        chainId,
      }),
      enabled: vault != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
      staleTime:
        query.staleTime ?? parameters.blockNumber != null
          ? Infinity
          : undefined,
    })),
  });
}

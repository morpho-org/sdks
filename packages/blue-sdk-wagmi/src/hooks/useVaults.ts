import { Vault } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Address } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import { fetchVaultQueryOptions } from "../query/fetchVault.js";
import { useChainId } from "./useChainId.js";
import { UseVaultParameters, UseVaultReturnType } from "./useVault.js";

export type UseVaultsParameters<
  config extends Config = Config,
  selectData = Vault,
> = {
  addresses: Iterable<Address>;
} & Omit<UseVaultParameters<config, selectData>, "id">;

export type UseVaultsReturnType<selectData = Vault> =
  UseVaultReturnType<selectData>[];

export function useVaults<
  config extends Config = ResolvedRegister["config"],
  selectData = Vault,
>({
  addresses,
  query = {},
  ...parameters
}: UseVaultsParameters<config, selectData>): UseVaultsReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(addresses, (address) => ({
      ...query,
      ...fetchVaultQueryOptions(config, {
        ...parameters,
        address,
        chainId,
      }),
      enabled: address != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}

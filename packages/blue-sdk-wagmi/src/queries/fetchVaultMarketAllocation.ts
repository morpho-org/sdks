import { VaultMarketAllocation } from "@morpho-org/blue-sdk";
import {
  DeploylessFetchParameters,
  fetchVaultMarketAllocation,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { MarketParameters } from "./fetchMarket";
import { VaultParameters } from "./fetchVault";

export type VaultMarketAllocationParameters = VaultParameters &
  MarketParameters;

export type FetchVaultMarketAllocationParameters =
  Partial<VaultMarketAllocationParameters> & DeploylessFetchParameters;

export function fetchVaultMarketAllocationQueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultMarketAllocationParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vault, marketId, chainId, ...parameters } = queryKey[1];
      if (!vault) throw Error("vault is required");
      if (!marketId) throw Error("marketId is required");

      return fetchVaultMarketAllocation(
        vault,
        marketId,
        config.getClient({ chainId }),
        {
          chainId,
          ...parameters,
        },
      );
    },
    queryKey: fetchVaultMarketAllocationQueryKey(parameters),
  } as const satisfies QueryOptions<
    VaultMarketAllocation,
    ReadContractErrorType,
    VaultMarketAllocation,
    FetchVaultMarketAllocationQueryKey
  >;
}

export function fetchVaultMarketAllocationQueryKey({
  vault,
  marketId,
  chainId,
  blockTag,
  blockNumber,
  deployless,
  account,
  stateOverride,
}: FetchVaultMarketAllocationParameters) {
  return [
    "fetchVaultMarketAllocation",
    // Ignore all other irrelevant parameters.
    {
      vault,
      marketId,
      chainId,
      blockTag,
      blockNumber,
      deployless,
      account,
      stateOverride,
    } as FetchVaultMarketAllocationParameters,
  ] as const;
}

export type FetchVaultMarketAllocationQueryKey = ReturnType<
  typeof fetchVaultMarketAllocationQueryKey
>;

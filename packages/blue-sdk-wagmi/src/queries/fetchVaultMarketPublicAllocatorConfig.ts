import { VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import {
  FetchParameters,
  fetchVaultMarketPublicAllocatorConfig,
} from "@morpho-org/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import { Config } from "wagmi";
import { MarketParameters } from "./fetchMarket";
import { VaultParameters } from "./fetchVault";

export type VaultMarketPublicAllocatorConfigParameters = VaultParameters &
  MarketParameters;

export type FetchVaultMarketPublicAllocatorConfigParameters =
  Partial<VaultMarketPublicAllocatorConfigParameters> & FetchParameters;

export function fetchVaultMarketPublicAllocatorConfigQueryOptions<
  config extends Config,
>(config: config, parameters: FetchVaultMarketPublicAllocatorConfigParameters) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn({ queryKey }) {
      const { vault, marketId, chainId, ...parameters } = queryKey[1];
      if (!vault) throw Error("vault is required");
      if (!marketId) throw Error("marketId is required");

      return fetchVaultMarketPublicAllocatorConfig(
        vault,
        marketId,
        config.getClient({ chainId }),
        {
          chainId,
          ...parameters,
        },
      );
    },
    queryKey: fetchVaultMarketPublicAllocatorConfigQueryKey(parameters),
  } as const satisfies QueryOptions<
    VaultMarketPublicAllocatorConfig,
    ReadContractErrorType,
    VaultMarketPublicAllocatorConfig,
    FetchVaultMarketPublicAllocatorConfigQueryKey
  >;
}

export function fetchVaultMarketPublicAllocatorConfigQueryKey({
  vault,
  marketId,
  chainId,
  blockTag,
  blockNumber,
  account,
  stateOverride,
}: FetchVaultMarketPublicAllocatorConfigParameters) {
  return [
    "fetchVaultMarketPublicAllocatorConfig",
    // Ignore all other irrelevant parameters.
    {
      vault,
      marketId,
      chainId,
      blockTag,
      blockNumber,
      account,
      stateOverride,
    } as FetchVaultMarketPublicAllocatorConfigParameters,
  ] as const;
}

export type FetchVaultMarketPublicAllocatorConfigQueryKey = ReturnType<
  typeof fetchVaultMarketPublicAllocatorConfigQueryKey
>;

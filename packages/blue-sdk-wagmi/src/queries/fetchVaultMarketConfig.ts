import type { VaultMarketConfig } from "@gfxlabs/blue-sdk";
import {
  type FetchParameters,
  fetchVaultMarketConfig,
} from "@gfxlabs/blue-sdk-viem";
import type { QueryOptions } from "@tanstack/query-core";
import type { ReadContractErrorType } from "viem";
import type { Config } from "wagmi";
import { hashFn } from "wagmi/query";
import { BLUE_SDK_QUERY_KEY_PREFIX } from "../query-key-prefix.js";
import type { MarketParameters } from "./fetchMarket.js";
import type { VaultParameters } from "./fetchVault.js";

export type VaultMarketConfigParameters = VaultParameters & MarketParameters;

export type FetchVaultMarketConfigParameters =
  Partial<VaultMarketConfigParameters> & FetchParameters;

export function fetchVaultMarketConfigQueryOptions<config extends Config>(
  config: config,
  parameters: FetchVaultMarketConfigParameters,
) {
  return {
    // TODO: Support `signal` once Viem actions allow passthrough
    // https://tkdodo.eu/blog/why-you-want-react-query#bonus-cancellation
    async queryFn() {
      const { vault, marketId, chainId } = parameters;

      if (!vault) throw Error("vault is required");
      if (!marketId) throw Error("marketId is required");

      return fetchVaultMarketConfig(
        vault,
        marketId,
        config.getClient({ chainId }),
        parameters,
      );
    },
    queryKey: fetchVaultMarketConfigQueryKey(parameters),
    queryKeyHashFn: hashFn, // for bigint support
  } as const satisfies QueryOptions<
    VaultMarketConfig,
    ReadContractErrorType,
    VaultMarketConfig,
    FetchVaultMarketConfigQueryKey
  >;
}

// blockNumber and blockTag are intentionally excluded from the query key so that
// TanStack Query reuses a single cache entry per entity instead of creating new
// entries every block (which causes OOM at scale on heavy pages).
//
// For consumers that do need multi-block views (e.g. comparing state across blocks),
// placeholderData: keepPreviousData gives instant-serve UX without multiplying cache entries.
// If hitting cache directly is some day more relevant, include blockNumber and blockTag to the query key
// BUT think of a way to mitigate cache creation/eviction at scale (multiple queries created
// simultaneously at each block when tracking latest).
export function fetchVaultMarketConfigQueryKey({
  vault,
  marketId,
  chainId,
  account,
  stateOverride,
}: FetchVaultMarketConfigParameters) {
  return [
    BLUE_SDK_QUERY_KEY_PREFIX,
    "fetchVaultMarketConfig",
    // Ignore all other irrelevant parameters.
    {
      vault,
      marketId,
      chainId,
      account,
      stateOverride,
    } as FetchVaultMarketConfigParameters,
  ] as const;
}

export type FetchVaultMarketConfigQueryKey = ReturnType<
  typeof fetchVaultMarketConfigQueryKey
>;

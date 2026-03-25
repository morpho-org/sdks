/**
 * Shared prefix for all `@morpho-org/blue-sdk-wagmi` query keys.
 *
 * Can be used with `queryClient.invalidateQueries({ queryKey: [BLUE_SDK_QUERY_KEY_PREFIX] })`
 * to invalidate every SDK query at once (e.g. on a new block).
 */
export const BLUE_SDK_QUERY_KEY_PREFIX = "@morpho-org/blue-sdk" as const;

/** All fetch-* query key names exported by the SDK. */
export const BLUE_SDK_QUERY_NAMES = [
  "fetchMarket",
  "fetchMarketParams",
  "fetchToken",
  "fetchUser",
  "fetchVault",
  "fetchVaultConfig",
  "fetchVaultUser",
  "fetchPosition",
  "fetchHolding",
  "fetchVaultMarketConfig",
  "fetchVaultV2",
  "fetchVaultV2Adapter",
] as const;

export type BlueSdkQueryName = (typeof BLUE_SDK_QUERY_NAMES)[number];

/** Minimal interface for a TanStack QueryClient (avoids version coupling). */
interface InvalidatableQueryClient {
  invalidateQueries(options: {
    queryKey: readonly unknown[];
    cancelRefetch?: boolean;
  }): Promise<void>;
}

/**
 * Invalidate all SDK queries so they re-fetch in-place.
 *
 * Call this whenever a new block arrives to replace the old pattern
 * of including `blockNumber` in every query key.
 *
 * @example
 * ```ts
 * useEffect(() => {
 *   if (!block?.number) return;
 *   invalidateAllBlueSdkQueries(queryClient);
 * }, [block?.number]);
 * ```
 */
export function invalidateAllBlueSdkQueries(
  queryClient: InvalidatableQueryClient,
  options?: { cancelRefetch?: boolean },
) {
  const cancelRefetch = options?.cancelRefetch ?? true;

  for (const name of BLUE_SDK_QUERY_NAMES) {
    queryClient.invalidateQueries({
      queryKey: [name],
      cancelRefetch,
    });
  }
}

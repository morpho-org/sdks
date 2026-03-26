/**
 * Shared prefix for all `@morpho-org/blue-sdk-wagmi` query keys.
 *
 * Every SDK query key starts with this prefix, so you can use it to
 * invalidate or filter all SDK queries at once:
 *
 * ```ts
 * queryClient.invalidateQueries({ queryKey: [BLUE_SDK_QUERY_KEY_PREFIX] })
 * ```
 */
export const BLUE_SDK_QUERY_KEY_PREFIX = "@morpho-org/blue-sdk" as const;

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

  queryClient.invalidateQueries({
    queryKey: [BLUE_SDK_QUERY_KEY_PREFIX],
    cancelRefetch,
  });
}

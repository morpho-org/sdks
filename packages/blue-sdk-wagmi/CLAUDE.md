# blue-sdk-wagmi Conventions

- Hooks wrap query option helpers: `useMarket` calls `fetchMarketQueryOptions`.
- Hook parameters compose fetch params, `ConfigParameter`, and `QueryParameter`.
- Keep query keys prefixed with `BLUE_SDK_QUERY_KEY_PREFIX` and use `hashFn` for bigint support.
- Exclude `blockNumber` and `blockTag` from cache keys unless a multi-block cache is intentional.
- Gate queries on required inputs, e.g. `enabled: parameters.marketId != null && query.enabled`.
- Use `replaceDeepEqual` as the default structural sharing for entity hooks.
- Multi-entity hooks dedupe inputs before `useQueries`, e.g. `new Set(marketIds)`.
- Return indexed records with `data`, `error`, `isFetching`, and `isFetchingAny`.
- Keep `throwOnError`, `queryFn`, and query key fields owned by query option helpers.

## Continuous Improvement

- This package is the React/Wagmi boundary for Blue SDK data; do not move hook or query coupling into core packages.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer composing core fetch/query helpers over duplicating protocol logic in hooks.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.

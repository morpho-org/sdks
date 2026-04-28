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

# simulation-sdk-wagmi Conventions

- Compose state from `blue-sdk-wagmi` hooks; do not duplicate entity fetch logic here.
- Entity queries require a known block before enabling: `enabled: block != null && query.enabled`.
- Invalidate Blue SDK queries when `block.number` changes so query closures refetch at the new block.
- Return discriminated pending/data states with `isPending`.
- Keep `blockTag` and `blockNumber` out of public fetch params except the single `block` object.
- Preserve per-entity query overrides under `entityQuery`, e.g. `entityQuery.markets`.
- Memoize derived query inputs that depend on iterables, e.g. `useMemo(() => Array.from(users), [users])`.
- Apply optional accrual through query `select`, e.g. `market.accrueInterest(block.timestamp)`.

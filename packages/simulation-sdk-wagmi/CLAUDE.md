# simulation-sdk-wagmi Conventions

- Compose state from `blue-sdk-wagmi` hooks; do not duplicate entity fetch logic here.
- Entity queries require a known block before enabling: `enabled: block != null && query.enabled`.
- Invalidate Blue SDK queries when `block.number` changes so query closures refetch at the new block.
- Return discriminated pending/data states with `isPending`.
- Keep `blockTag` and `blockNumber` out of public fetch params except the single `block` object.

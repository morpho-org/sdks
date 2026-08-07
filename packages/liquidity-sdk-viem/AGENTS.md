# liquidity-sdk-viem Conventions

- GraphQL queries live in `graphql/*.gql`; regenerate API types with this package's `codegen` script.
- Do not hand-edit generated `src/api/sdk.ts`; update queries or `codegen.ts` instead.
- `loader.ts` owns Vault V1 planning and `vaultV2LiquidityLoader.ts` owns the independent Vault V2 planner. Keep their state fetching and simulation flows separate; do not use inheritance or a shared mutable state model across allocator versions.
- Loader code batches by market ID through `DataLoader`.
- Snapshot all onchain state at one block before simulation, e.g. pass `{ blockNumber: block.number }`.
- Convert API maps through `fromEntries` and filter with `isDefined`.
- Public liquidity options use WAD-scaled `bigint` thresholds.
- `apiSdk` is a singleton `GraphQLClient` bound to `BLUE_API_GRAPHQL_URL`.
- Batch expensive market requests by chunking IDs before paginating.
- Keep loader output deterministic: return version-appropriate `withdrawals` or `reallocations`, `startState`, `endState`, and utilization.
- Vault V2 has no canonical BluePublicAllocator registry entry. Its loader takes the allocator and participating Vault V2 addresses explicitly and never infers them from chain configuration.

## Continuous Improvement

- Keep API/RPC I/O explicit at the loader boundary; returned liquidity plans should be deterministic and typed.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer fewer data shapes and fewer exported helpers over broad liquidity abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.

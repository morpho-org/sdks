# liquidity-sdk-viem Conventions

- GraphQL queries live in `graphql/*.gql`; regenerate API types with this package's `codegen` script.
- Do not hand-edit generated `src/api/sdk.ts`; update queries or `codegen.ts` instead.
- Loader code batches by market ID through `DataLoader`.
- Snapshot onchain state at one block before simulation, e.g. pass `{ blockNumber: block.number }`.
- Convert API maps through `fromEntries` and filter with `isDefined`.
- Public liquidity options use WAD-scaled `bigint` thresholds.
- `apiSdk` is a singleton `GraphQLClient` bound to `BLUE_API_GRAPHQL_URL`.
- Batch expensive market requests by chunking IDs before paginating.
- Keep loader output deterministic: return `withdrawals`, `startState`, `endState`, and utilization.

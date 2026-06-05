# liquidation-sdk-viem Conventions

## Deprecated package freeze

- `@morpho-org/liquidation-sdk-viem` is frozen/deprecated. Do not make feature, address, ABI, dependency, test, JSDoc, refactor, or changeset updates in this package.
- Only PRs explicitly scoped to deprecation metadata or source deletion may touch this package, and those PRs must not add new supported behavior.
- If requested work appears to require this package, stop and move the maintained surface to `@morpho-org/morpho-sdk`, `@morpho-org/blue-sdk`, or `@morpho-org/blue-sdk-viem` as appropriate, or leave this package unchanged.

- GraphQL queries live in `graphql/*.gql`; regenerate API types with this package's `codegen` script.
- Do not hand-edit generated `src/api/sdk.ts`; update queries or `codegen.ts` instead.
- `LiquidationEncoder` extends `ExecutorEncoder` and owns liquidation execution assembly from typed position, token, and swap inputs.
- Token integrations are grouped under `src/tokens`, e.g. `Pendle`, `Spectra`, `Sky`.
- Swap adapters stay under `src/swap`; normalize generated API output before passing data into token or swap encoders.
- Fetch market and position data in parallel, then build `AccrualPosition` or `PreLiquidationPosition`.
- External swap integrations return typed swap data; validate ambiguous results before encoding calls.
- Use shared pagination helpers for API lists; first page gives `countTotal`.
- Chunk market ID queries when API calls can grow large.
- Treat API bigint strings defensively in tests, e.g. `BigInt(position.state?.borrowShares ?? "0")`.

## Continuous Improvement

- Keep external API, swap, and execution I/O explicit at package edges; liquidation decisions should stay typed and auditable.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer protocol-specific clarity over generic bot abstractions when behavior differs.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.

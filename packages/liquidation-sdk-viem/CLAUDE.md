# liquidation-sdk-viem Conventions

- GraphQL queries live in `graphql/*.gql`; regenerate API types with this package's `codegen` script.
- Do not hand-edit generated `src/api/sdk.ts`; update queries or `codegen.ts` instead.
- Keep liquidation execution helpers on `LiquidationEncoder`, extending `ExecutorEncoder`.
- Token integrations are grouped under `src/tokens`, e.g. `Pendle`, `Spectra`, `Usual`.
- Fetch market and position data in parallel, then build `AccrualPosition` or `PreLiquidationPosition`.
- External swap integrations return typed swap data; validate ambiguous results before encoding calls.
- Use shared pagination helpers for API lists; first page gives `countTotal`.
- Chunk market ID queries when API calls can grow large.
- Treat API bigint strings defensively in tests, e.g. `BigInt(position.state?.borrowShares ?? "0")`.

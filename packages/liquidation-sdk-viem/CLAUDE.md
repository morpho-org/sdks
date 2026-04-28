# liquidation-sdk-viem Conventions

- GraphQL queries live in `graphql/*.gql`; regenerate API types with this package's `codegen` script.
- Do not hand-edit generated `src/api/sdk.ts`; update queries or `codegen.ts` instead.
- Keep liquidation execution helpers on `LiquidationEncoder`, extending `ExecutorEncoder`.
- Token integrations are grouped under `src/tokens`, e.g. `Pendle`, `Spectra`, `Usual`.
- Fetch market and position data in parallel, then build `AccrualPosition` or `PreLiquidationPosition`.
- External swap integrations return typed swap data; validate ambiguous results before encoding calls.

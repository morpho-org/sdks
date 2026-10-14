# morpho-test Conventions

- Keep fixtures framework-agnostic; test runners should consume them, not live here.
- Export fixture groups from `src/fixtures/index.ts` through `src/index.ts`.
- Registry-driven E2E helpers live in `src/e2e/` and are exported through `src/index.ts` beside the fixtures. They stay pure: they read the address registry and an injected `env`, and test runners build suites from their output.
- Fixture files are static protocol data grouped by entity type: markets, tokens, and vaults.
- Use concrete chain keys, e.g. `markets[ChainId.EthMainnet]`.
- Keep fixture data typed with `blue-sdk` models and IDs.
- Use `parseUnits("94.5", 16)` for LLTV percentages in market fixtures.
- Prefer deterministic, parameterized fixture helpers, e.g. `randomMarket({ loanToken })`.
- Keep token capability sets explicit, e.g. `withSimplePermit[ChainId.EthMainnet]`.

## Continuous Improvement

- Keep this package framework-agnostic; runner-specific glue belongs in dedicated test adapter packages.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.

---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Migrate `@morpho-org/wdk-protocol-lending-morpho-evm` into the `morpho-org/sdks` monorepo (TIB-2026-05-18). The package keeps its published name and public API unchanged; ownership, releases, and security review now follow the monorepo's Changesets + Cantina cadence. Workspace `@morpho-org/*` dependencies are now resolved via `workspace:^` ranges, `viem` becomes a peer dependency, and the existing jest unit + Anvil-fork integration suites run in CI on every push.

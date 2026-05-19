---
name: module-api-architecture
kind: baseline
applies: AGENTS.md §1 Architecture (layering, modularity), §4 Public API & packaging
out-of-scope:
  - Lint mechanics (2-space indent, organize-imports) — see style-conventions.
  - Type-safety inside a function body — see code-quality.
  - JSDoc on the exported symbols — see documentation.
focus: Package boundaries, public surface, type/import discipline, NodeNext compatibility.
---

# Module & API Architecture

Focus: package boundaries, public surface, type/import discipline, NodeNext compatibility.

Prompt must include:

- Public exports come from `packages/<pkg>/src/index.ts` only — no deep imports into other packages
- Relative imports include `.js` suffix (NodeNext) — e.g. `export * from "./market/index.js"`
- Prefer type-only imports where possible (`import type { Address } from "viem"`)
- Reuse SDK types for protocol values: `Address`, `MarketId`, `ChainId`, `BigIntish`
- `bigint` for onchain quantities and WAD-scaled rates (e.g. `92_0000000000000000n`)
- `as const` and `satisfies` for protocol lists and ABI literals (e.g. `BLUE_OPERATIONS as const`)
- Domain failures are typed `Error` subclasses with readonly inputs
- Edits to generated **inputs** (e.g. `graphql/*.gql`), not generated files (e.g. `src/api/sdk.ts`)
- No edits to build output under `lib/`
- Reference the root `AGENTS.md`, the package's `AGENTS.md` (and any nested `AGENTS.md`), and the package's own `package.json` `exports` field

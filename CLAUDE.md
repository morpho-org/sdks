# Monorepo Conventions

- Use pnpm with Node >=22; root checks are `pnpm lint` and `pnpm test`.
- Keep TypeScript strict and NodeNext-friendly; relative imports include `.js`, e.g. `export * from "./market/index.js";`.
- Prefer type-only imports where possible: `import type { Address } from "viem";`.
- Let Biome own style: 2-space indentation, organized imports, no unused imports or variables.
- Use `bigint` for onchain quantities and WAD-scaled rates, e.g. `92_0000000000000000n`.
- Reuse SDK types for protocol values: `Address`, `MarketId`, `ChainId`, `BigIntish`.
- Public package APIs are explicit re-exports from `src/index.ts`; do not expose deep files accidentally.
- Never edit build output in `lib/`; source and tests live under `packages/*/src` and `packages/*/test`.
- Prefer `as const` and `satisfies` for protocol lists and ABI literals, e.g. `BLUE_OPERATIONS as const`.
- Change generated inputs, not generated files, e.g. edit `graphql/*.gql` before `src/api/sdk.ts`.
- Domain failures are typed `Error` classes with readonly inputs, e.g. `new UnknownTokenError(address)`.
- Keep package responsibilities narrow; a package should have one clear reason to exist.
- Prefer deleting unclear helpers, constants, exports, or duplicated logic before adding abstractions.
- Add dependencies only when they directly reduce integrator risk or complexity in the owning package.
- Codify security-sensitive behavior as tests, especially routing, authorization, chain, and accounting invariants.
- Add concise JSDoc to every new exported JavaScript class, object, constant, or function; avoid JSDoc on internal locals and test helpers.

## Continuous Improvement

- Existing packages may predate these conventions; do not widen divergence when touching them.
- Move touched code toward the nearest applicable `CLAUDE.md` guidance, even when a full cleanup is out of scope.
- If a package cannot yet meet an applicable convention, keep the exception local and document why in the nearest `CLAUDE.md`.

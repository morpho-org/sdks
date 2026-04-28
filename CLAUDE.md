# Monorepo Conventions

- Use pnpm with Node >=22; root checks are `pnpm lint` and `pnpm test`.
- Keep TypeScript strict and NodeNext-friendly; relative imports include `.js`, e.g. `export * from "./market/index.js";`.
- Prefer type-only imports where possible: `import type { Address } from "viem";`.
- Let Biome own style: 2-space indentation, organized imports, no unused imports or variables.
- Use `bigint` for onchain quantities and WAD-scaled rates, e.g. `92_0000000000000000n`.
- Reuse SDK types for protocol values: `Address`, `MarketId`, `ChainId`, `BigIntish`.
- Public package APIs are explicit re-exports from `src/index.ts`; do not expose deep files accidentally.
- Never edit build output in `lib/`; source and tests live under `packages/*/src` and `packages/*/test`.

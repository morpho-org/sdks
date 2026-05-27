---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Align the package on the monorepo conventions: migrate sources and tests from JavaScript + JSDoc to TypeScript (`src/index.ts`, `src/morpho-presets.ts`, `src/morpho-protocol-evm.ts`, colocated `src/morpho-protocol-evm.test.ts`, `tests/integration/module.test.ts`), drop the hand-written `types/` declaration directory, replace the legacy `tsconfig.json` with the standard root-extending pair plus dual ESM/CJS `tsconfig.build.{esm,cjs}.json`, restructure `package.json` to use `main: src/index.ts` and `publishConfig.exports` for dual publish, and re-enable Biome on the package (`biome.json` no longer skips it). The published surface and runtime behaviour are unchanged: `default` and named `MorphoProtocolEvm` exports, the `bare` runtime entry, the `MORPHO_VAULT_PRESETS`/`MORPHO_MARKET_PRESETS` tables, and every method signature stay byte-compatible — only the source language and build pipeline change.

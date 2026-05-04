---
"@morpho-org/morpho-sdk": patch
"@morpho-org/evm-simulation": patch
---

Backfill JSDoc on every Tier 1 exported symbol per [TIB-2026-05-04](../docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md): action builders (`vaultV1`, `vaultV2`, `marketV1`, `requirements`), `MorphoClient` and its factory methods, every exported error class, and `evm-simulation`'s `simulate()` / `screenAddresses()`. Doc-only — no runtime changes. Phase 5 wires `eslint-plugin-jsdoc` as a CI gate scoped to these paths so future Tier 1 exports must ship with the §6 tag set on first commit.

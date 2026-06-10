---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
---

Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, non-protocol-specific ABI literals, fixed-point math helpers, shared bigint/address/call descriptor types, typed registry/math errors, `ORACLE_PRICE_SCALE`, and `assertNonNegative`.

Add `getChainAddress` and `MissingAddressError` for checked, label-based address access without protocol-specific registry getters.

Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

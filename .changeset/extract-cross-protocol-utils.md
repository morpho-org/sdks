---
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/liquidity-sdk-viem": patch
"@morpho-org/morpho-test": patch
---

Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, non-protocol-specific ABI literals, fixed-point math helpers, shared bigint/address/call descriptor types, typed registry/math errors, `ORACLE_PRICE_SCALE`, and `assertNonNegative`.

Add `getChainAddress` and `UnknownAddressError` for checked, label-based address access without protocol-specific registry getters.

Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

Expose the shared address registry helpers, registry types, and `UnknownAddressError` through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

Update maintained peer dependents of `@morpho-org/blue-sdk` to require `@morpho-org/morpho-ts` `^2.7.0`, matching the extracted shared primitives used by the Blue SDK compatibility layer.

---
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/evm-simulation": patch
"@morpho-org/liquidity-sdk-viem": patch
"@morpho-org/morpho-test": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, and `assertNonNegative`.

Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

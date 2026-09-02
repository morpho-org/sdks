---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Pin the transaction-building Morpho runtime dependencies (`@morpho-org/morpho-sdk`, `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem`) to exact published versions via `workspace:*` instead of `workspace:^`. As a leaf ERC-4337 lending adapter that constructs value-bearing transactions, this prevents a passive semver minor/patch of a transaction-building package from changing calldata, `value`, approvals, or recipients without a deliberate release of this adapter, and aligns these deps with the already exact-pinned `@tetherto/wdk-*` runtime deps. The deviation from the `workspace:^` convention is documented in the package `AGENTS.md`. Addresses audit finding SDKS-72.

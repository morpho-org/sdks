---
"@morpho-org/blue-sdk": patch
"@morpho-org/blue-sdk-wagmi": patch
"@morpho-org/evm-simulation": patch
"@morpho-org/liquidation-sdk-viem": patch
"@morpho-org/morpho-sdk": patch
"@morpho-org/simulation-sdk": patch
"@morpho-org/simulation-sdk-wagmi": patch
"@morpho-org/test": patch
---

Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

- Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
- Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
- Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

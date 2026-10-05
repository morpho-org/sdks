---
"@morpho-org/midnight-sdk": major
"@morpho-org/morpho-ts": major
"@morpho-org/blue-sdk": major
"@morpho-org/evm-simulation": major
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-test": patch
---

Remove the MidnightBundles (V1) contract symbols, per ADR-2026-10-02-midnight-bundles-v2-sdk-actions. `midnight-sdk` drops `midnightBundlesAbi`; `morpho-ts` drops the `midnightBundles` address and deployment-block keys, and `blue-sdk` re-exports the narrowed registries (it now peers on `morpho-ts` ^4). The `evm-simulation` bundle-retention guard restricts `midnightBundlesV2` instead of `midnightBundles`. `blue-sdk-viem` and `morpho-test` widen their peer ranges to the new majors. Integrations that still use V1 stay on the previous majors.

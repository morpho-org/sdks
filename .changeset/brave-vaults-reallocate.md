---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/liquidity-sdk-viem": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

Add the canonical `vaultV2BluePublicAllocatorAbi` to `morpho-ts`, move the shared `marketParamsAbi` source of truth there while preserving its `blue-sdk` re-export, and raise the `blue-sdk` peer range to the introducing `morpho-ts` minor. Add Vault V2 allocation-cap helpers and allocator config types to `blue-sdk`, add explicit-allocator deployless and fallback reads to `blue-sdk-viem`, and expose Vault V2 shared-liquidity discovery, planning, metrics, maximum native-penalty filtering, and flat market/idle reallocations through `morpho-sdk` Blue flows. Use coherent versioned names across the V1 and V2 reallocation APIs, including `VaultV1ReallocationData`, `VaultV2ReallocationData`, `computeVaultV1Reallocations`, `computeVaultV2Reallocations`, `VaultV2BluePublicAllocatorOptions`, and Vault V2-prefixed Bundler actions. Preserve the published V1 names as deprecated aliases, add an independent `VaultV2LiquidityLoader` alongside the existing Vault V1 loader, raise its `blue-sdk-viem` and `morpho-sdk` peer floors to the introducing minors, and allow the WDK borrow flow to accept the combined V1/V2 reallocation union.

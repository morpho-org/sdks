---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/liquidity-sdk-viem": patch
---

Add the canonical `vaultV2BluePublicAllocatorAbi` to `morpho-ts`; add Vault V2 allocation-cap helpers and allocator config types to `blue-sdk`; add explicit-allocator deployless and fallback reads to `blue-sdk-viem`; and expose Vault V2 shared-liquidity discovery, planning, metrics, maximum native-penalty filtering, and flat market/idle reallocations through `morpho-sdk` Blue flows. Use coherent versioned names across the V1 and V2 reallocation APIs, including `VaultV1ReallocationData`, `VaultV2ReallocationData`, `computeVaultV1Reallocations`, `computeVaultV2Reallocations`, and Vault V2-prefixed Bundler actions. Preserve the published V1 names as deprecated aliases and migrate `liquidity-sdk-viem` to the canonical V1 state name.

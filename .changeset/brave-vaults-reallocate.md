---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

Add the canonical Blue Public Allocator ABI to `morpho-ts`; add Vault V2 allocation-cap helpers and allocator config types to `blue-sdk`; add explicit-allocator deployless and fallback reads to `blue-sdk-viem`; and expose Vault V2 shared-liquidity discovery, planning, metrics, and flat market/idle reallocations through `morpho-sdk` Blue flows. Canonicalize the V1 names as `computeVaultV1Reallocations` and `VaultV1BlueReallocation` while preserving their deprecated aliases.

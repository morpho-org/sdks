---
"@morpho-org/blue-sdk-viem": patch
---

Deployless `fetchVault` now reports `publicAllocatorConfig` as `undefined` when the vault has not enabled the chain's PublicAllocator as an allocator, matching the multicall path. Previously the deployless path returned a zeroed `{ admin, fee, accruedFee }` config whenever the chain had a PublicAllocator, which made Vault V1 shared-liquidity planning treat the vault as reallocatable. The generated `GetVault` query ABI gains a `hasPublicAllocator` flag.

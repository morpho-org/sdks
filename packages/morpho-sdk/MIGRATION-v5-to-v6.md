# Migrating morpho-sdk v5 to v6

## Vault V2-only Blue write reallocations

High-level `borrow`, `withdraw`, `supplyCollateralBorrow`, and `refinance` inputs now accept only
`VaultV2BlueReallocation` entries. Replace Vault V1 write inputs with reallocations returned by
`getVaultV2BlueReallocations()`.

Vault V1 data fetchers, planners, types, and explicit low-level Bundler3 composition remain
available. Use them only when constructing Bundler3 calls directly.

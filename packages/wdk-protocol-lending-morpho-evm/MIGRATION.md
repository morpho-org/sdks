# Migrating WDK Morpho lending v1 to v2

## Vault V2-only borrow reallocations

`MorphoBorrowOptions.reallocations` now accepts only `readonly VaultV2BlueReallocation[]`.
Replace Vault V1 inputs with Vault V2 BluePublicAllocator reallocations before upgrading.

# Migrating WDK Morpho lending v1 to v2

## Vault V2-only borrow reallocations

`MorphoBorrowOptions.reallocations` now accepts only `readonly VaultV2BlueReallocation[]`.
Replace Vault V1 inputs with Vault V2 BluePublicAllocator reallocations before upgrading.

## Removed exports

- `MorphoBorrowWithVaultV2ReallocationsOptions` — folded into `MorphoBorrowOptions`, which is now
  Vault V2-only. Use `MorphoBorrowOptions` directly; `getBorrowRequirements` no longer needs a
  reallocation-specific overload.
- `VaultReallocation` and `VaultV1Reallocation` re-exports — removed. Import `VaultV2BlueReallocation`
  and pass Vault V2 BluePublicAllocator reallocations instead.

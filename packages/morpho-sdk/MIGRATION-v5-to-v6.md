# Migrating morpho-sdk v5 to v6

## Vault V2-only Blue write reallocations

High-level `borrow`, `withdraw`, `supplyCollateralBorrow`, and `refinance` inputs now accept only
`VaultV2BlueReallocation` entries. Replace Vault V1 write inputs with reallocations returned by
`getVaultV2BlueReallocations()`.

Vault V1 data fetchers, planners, types, and explicit low-level Bundler3 composition remain
available. Use them only when constructing Bundler3 calls directly.

## Removed action-output field: `reallocationFee`

`BlueBorrowAction`, `BlueWithdrawAction`, `BlueSupplyCollateralBorrowAction`, and
`BlueRefinanceAction` no longer expose `reallocationFee` in `action.args`. That field only ever
carried Vault V1 native PublicAllocator fees, which high-level writes no longer emit. Read
`reallocationPenaltyAssets` for the loan-token penalty donated by Vault V2 BluePublicAllocator
reallocations.

## Removed type: `BlueReallocationPlan`

The `BlueReallocationPlan` union is removed. High-level Blue write inputs accept
`Iterable<VaultV2BlueReallocation>` directly; for explicit low-level Vault V1 composition, use
`VaultV1Reallocation[]`.

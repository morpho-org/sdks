---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Accept only Vault V2 BluePublicAllocator reallocations in high-level Morpho Blue write inputs.
Remove Vault V1 shared-liquidity planners, data, inputs, validation, and explicit low-level Bundler3
composition from morpho-sdk v6. Update the WDK borrow input for the next major. Direct Vault V1
flows and canonical raw ABI, address, fetch, and config exports remain.

Remove the now-vestigial `reallocationFee` field from the `blueBorrow`, `blueWithdraw`,
`blueSupplyCollateralBorrow`, and `blueRefinance` action outputs (it only ever carried Vault V1
native allocator fees, which high-level writes no longer emit; V2 penalties are reported via
`reallocationPenaltyAssets`). Remove the now-unused `BlueReallocationPlan` type.

Remove morpho-sdk's previously deprecated compatibility exports, including ambiguous unprefixed
Blue and Midnight facade aliases, operation-specific scalar/native/refinance error aliases, and
deprecated upstream ABI, constant, typed-data helper, and utility-type aliases. Canonical qualified
facade names, generic errors, and canonical raw protocol exports remain.

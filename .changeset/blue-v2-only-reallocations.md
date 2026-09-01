---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
"@morpho-org/liquidity-sdk-viem": patch
---

Accept only Vault V2 BluePublicAllocator reallocations in high-level Morpho Blue write inputs.
Vault V1 planners and explicit low-level Bundler3 composition remain available. Update the WDK
borrow input and widen liquidity-sdk-viem's morpho-sdk peer range for the next major.

Remove the now-vestigial `reallocationFee` field from the `blueBorrow`, `blueWithdraw`,
`blueSupplyCollateralBorrow`, and `blueRefinance` action outputs (it only ever carried Vault V1
native allocator fees, which high-level writes no longer emit; V2 penalties are reported via
`reallocationPenaltyAssets`). Remove the now-unused `BlueReallocationPlan` type.

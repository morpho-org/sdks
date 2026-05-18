---
"@morpho-org/blue-sdk": major
"@morpho-org/blue-sdk-viem": major
"@morpho-org/simulation-sdk": patch
---

Fix `VaultV2._wrap` / `_unwrap` (and `toAssets` / `toShares` / `maxWithdraw`) overstating assets when fees are pending: pair stored `_totalAssets` with stored `totalSupply` (both pre-accrue) instead of post-accrue `totalAssets` with pre-accrue `totalSupply`. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math.

**Breaking:** `VaultV2.totalAssets` is removed (always equalled `_totalAssets` after the fix). Read `_totalAssets` instead. The `totalAssets()` fetch is dropped from `fetchVaultV2` (deployless and multicall).

---
"@morpho-org/blue-sdk": patch
"@morpho-org/blue-sdk-viem": patch
---

Fix `VaultV2._wrap` / `_unwrap` (and `toAssets` / `toShares` / `maxWithdraw`) overstating assets when fees are pending: pair stored `_totalAssets` with stored `totalSupply` (both pre-accrue) instead of post-accrue `totalAssets` with pre-accrue `totalSupply`. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math. Drop the unused `totalAssets` fetch from `fetchVaultV2` (deployless and multicall); `totalAssets` on the entity now defaults to `_totalAssets` at construction.

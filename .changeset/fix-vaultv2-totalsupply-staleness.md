---
"@morpho-org/blue-sdk": patch
---

Fix `VaultV2._wrap` / `_unwrap` (and the public `toAssets` / `toShares` / `maxWithdraw` paths layered on them) overstating available assets when management or performance fees are pending. The conversion math previously paired post-accrue `totalAssets` (from the contract's `accrueInterestView`) with the stored `totalSupply`, which excludes pending fee shares — making share→assets conversions overshoot by `~ 1 + pendingFeeShares / totalSupply`. The math now pairs the stored `_totalAssets` with the stored `totalSupply`: both are pre-accrue and internally consistent. Call `AccrualVaultV2.accrueInterest(timestamp)` first when post-accrue math is needed — it rolls `_totalAssets` forward and mints pending fee shares into `totalSupply` atomically. Field names stay aligned with the onchain contract: `totalAssets` (post-accrue, `accrueInterestView`) and `_totalAssets` (stored, pre-accrue).

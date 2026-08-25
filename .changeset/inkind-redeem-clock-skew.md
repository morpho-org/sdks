---
"@morpho-org/morpho-sdk": patch
---

Clamp in-kind redemption interest accrual forward past each vault market's `lastUpdate`. `MorphoVaultV1.inKindRedeem` and `MorphoVaultV2.inKindRedeem` previously accrued markets to the caller's raw local clock, so a lagging clock (relative to a block that just accrued a vault market) made them throw `InvalidInterestAccrual` instead of returning the exit handle. This mirrors the existing guard in `previewVaultV2InKindRedeem` and the vault deposit paths.

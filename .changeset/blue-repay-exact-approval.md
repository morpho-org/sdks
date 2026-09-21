---
"@morpho-org/morpho-sdk": patch
---

Full repay now defaults its classic approval to the exact `maxRepayAssets` pull instead of the token's reusable maximum or `maxUint256`; pass `approvalAmount` to keep a reusable allowance.

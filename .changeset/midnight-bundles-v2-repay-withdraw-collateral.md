---
"@morpho-org/morpho-sdk": major
---

Midnight `repayWithdrawCollateral` now routes through MidnightBundlesV2 for the sender: it takes `repayUnits` (`maxUint256` for the full debt at execution time), a finite `maxRepayAssets`, and a `collateralWithdrawals` list (`maxUint256` assets for the whole balance). `repayAssets`, `withdrawCollateralAssets`, `collateralIndex` and `onBehalf` are removed. See `MIGRATION-v6-to-v7.md`.

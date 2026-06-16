---
"@morpho-org/morpho-sdk": patch
---

Fix `MorphoVaultV1.deposit` deriving `maxSharePrice` from pre-accrue vault state. MetaMorpho's `deposit` calls `_accrueInterest()`, so the execution-time share price is `>=` the build-time one; without a forward-accrual buffer the slippage bound could be too tight and revert GeneralAdapter1's check with `SlippageExceeded`. VaultV1 deposit now forward-accrues interest by 2h before computing shares, mirroring `MorphoVaultV2.deposit` and blue repay.

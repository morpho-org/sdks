---
"@morpho-org/morpho-sdk": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Add Midnight `makeWithdraw` and `makeRepay` methods for reduce-only lender and borrower limit exits through MidnightBundlesV2. Both preserve the supplied offer tree and reject offers with the wrong side or without reduceOnly.

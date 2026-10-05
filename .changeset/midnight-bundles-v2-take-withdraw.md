---
"@morpho-org/morpho-sdk": minor
---

Add Midnight `takeWithdraw` and the `midnightTakeWithdraw` builder: a reduce-only MidnightBundlesV2 sell that redeems the sender's credit first, then sells the rest of the target to lend-side offers, without opening debt.

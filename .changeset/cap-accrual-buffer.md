---
"@morpho-org/morpho-sdk": patch
---

Reserve a forward interest-accrual buffer (`capAccrualBuffer`, default 2h) under Vault V2 and BluePublicAllocator absolute caps when planning Blue reallocations, so transactions included after the quote block no longer revert with `AbsoluteCapExceeded`.

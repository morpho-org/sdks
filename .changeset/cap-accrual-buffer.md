---
"@morpho-org/morpho-sdk": minor
---

Reserve a forward interest-accrual buffer (`capAccrualBuffer` option, default 2h; `0n` restores the previous sizing) when planning Vault V2 Blue reallocations: target-market absolute and relative cap checks now account for the interest the vault's existing allocation accrues before inclusion, so transactions included after the quote block no longer revert with `AbsoluteCapExceeded`. Default reallocation amounts are slightly smaller when a cap binds. Adds `DEFAULT_CAP_ACCRUAL_BUFFER`.

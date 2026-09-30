---
"@morpho-org/morpho-sdk": minor
---

Reserve a forward interest-accrual buffer (`capAccrualBuffer` option, default 2h; `0n` restores the previous sizing) when planning Vault V2 Blue reallocations: target-market absolute and relative cap checks account for the interest each touched position (target, and market sources on cap ids they share) accrues before inclusion, with reserves frozen from pre-plan state and carried across the legs of one plan, so transactions included after the quote block no longer revert with `AbsoluteCapExceeded`. Default reallocation amounts are slightly smaller when a cap binds. Adds `DEFAULT_CAP_ACCRUAL_BUFFER`.

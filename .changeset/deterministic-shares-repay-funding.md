---
"@morpho-org/morpho-sdk": minor
---

Make shares-mode repay funding deterministic and reusable. `MorphoBlue.repay`
and `MorphoBlue.repayWithdrawCollateral` accept an optional `now` anchor (Unix
seconds, defaults to the machine clock) for the 2h forward-accrual that sizes
the loan-token transfer, and the funding math is extracted into the exported
pure helper `computeSharesRepayFunding` (plus `computeRepayAccrualTimestamp`
and the `REPAY_ACCRUAL_BUFFER` constant).

Previously the buffered transfer was recomputed from the wall clock inside the
entity, so an integrator sizing a native/ERC-20 split moments before building
could land in a later second and get an ERC-20 pull a few wei of interest
larger than the split it planned — over-pulling a balance drained to the last
wei by the split and reverting the bundle at simulation/execution. Sizing the
split with `computeSharesRepayFunding({ market, shares, now })` and passing
the same `now` to the entity reproduces the pull byte-for-byte.

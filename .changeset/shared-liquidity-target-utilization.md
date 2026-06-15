---
"@morpho-org/morpho-sdk": minor
---

Add shared-liquidity metrics and a `maintainSupplyTargetUtilization` opt-in.

- `computeMaxBorrowToUtilization` / `MorphoBlue.getMaxBorrowToUtilization`: maximum additional borrow that keeps a market at or below a target utilization (e.g. 90%), accounting for the shared liquidity sibling vaults can supply via the PublicAllocator.
- `computeAvailableSharedLiquidity` / `MorphoBlue.getAvailableSharedLiquidity`: total reallocatable liquidity into a market. Both are read-only and never throw on insufficiency (return `0n`).
- `ReallocationComputeOptions.maintainSupplyTargetUtilization`: when `true`, the aggressive phase no longer relaxes the target market to 100% utilization — it holds the target at `supplyTargetUtilization` while still draining source markets to provide that liquidity. Defaults to `false` (unchanged behavior).

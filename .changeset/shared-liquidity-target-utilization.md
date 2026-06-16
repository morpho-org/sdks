---
"@morpho-org/morpho-sdk": minor
---

Add a shared-liquidity metric and a `maintainSupplyTargetUtilization` opt-in.

- `computeAvailableSharedLiquidity`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Read-only and never throws on insufficiency (returns `0n`).
- `ReallocationComputeOptions.maintainSupplyTargetUtilization`: when `true`, the aggressive phase no longer relaxes the target market to 100% utilization — it holds the target at `supplyTargetUtilization` while still draining source markets to provide that liquidity. Defaults to `false` (unchanged behavior).

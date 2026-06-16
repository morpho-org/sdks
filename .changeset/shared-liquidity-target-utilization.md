---
"@morpho-org/morpho-sdk": minor
---

Add a shared-liquidity metric and a `maintainSupplyTargetUtilization` opt-in.

- `computeAvailableSharedLiquidity`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Read-only and never throws on insufficiency (returns `0n`).
- `computeAvailableLiquidityToTargetUtilization`: borrow-free read-only metric. For a target below `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`) it returns the target's own borrow headroom to that ceiling plus the shared liquidity drained from source markets at 100% utilization; it returns `0n` when the target is already at or above the ceiling.
- `ReallocationComputeOptions.maintainSupplyTargetUtilization`: when `true`, the aggressive phase no longer relaxes the target market to 100% utilization — it holds the target at `supplyTargetUtilization` while still draining source markets to provide that liquidity. Defaults to `false` (unchanged behavior).

---
"@morpho-org/morpho-sdk": minor
---

Add shared-liquidity metrics and a `maintainSupplyTargetUtilization` opt-in.

- `computeLiquidityToTargetUtilization` / `MorphoBlue.getLiquidityToTargetUtilization`: liquidity available to bring a market to a target utilization (e.g. 90%) — the market's own borrow headroom plus the shared liquidity reallocatable from sibling vaults via the PublicAllocator. Returns own headroom only when the target is below the reallocation trigger, and shared liquidity only at the current utilization.
- `computeAvailableSharedLiquidity` / `MorphoBlue.getAvailableSharedLiquidity`: total reallocatable liquidity into a market. Both are read-only and never throw on insufficiency (return `0n`).
- `ReallocationComputeOptions.maintainSupplyTargetUtilization`: when `true`, the aggressive phase no longer relaxes the target market to 100% utilization — it holds the target at `supplyTargetUtilization` while still draining source markets to provide that liquidity. Defaults to `false` (unchanged behavior).

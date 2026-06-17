---
"@morpho-org/morpho-sdk": minor
---

Add two read-only shared-liquidity metrics.

- `computeAvailableSharedLiquidity`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Read-only and never throws on insufficiency (returns `0n`).
- `computeAvailableLiquidityToTargetUtilization`: borrow-free read-only metric for the liquidity available to bring a market to `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`). Returns the market's own borrow headroom plus the reallocatable shared liquidity; only the own headroom when `supplyTargetUtilization > targetUtilization`, and only the shared liquidity when `targetUtilization` equals the current utilization.

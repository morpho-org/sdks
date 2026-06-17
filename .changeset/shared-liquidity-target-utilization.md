---
"@morpho-org/morpho-sdk": minor
---

Add two read-only public-allocator liquidity metrics as `ReallocationData` methods.

- `ReallocationData.getPublicReallocationLiquidity(marketId, options?)`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Never throws on insufficiency (returns `0n`).
- `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, targetUtilization?, options?)`: the maximum additional borrow that keeps a market at or below `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`), counting the liquidity the PublicAllocator can reallocate in. Measured as the borrow headroom on the supply augmented by the reallocatable liquidity, so it returns the own headroom only when `supplyTargetUtilization > targetUtilization` and `0n` when the market is already at or above the target.

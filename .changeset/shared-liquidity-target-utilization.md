---
"@morpho-org/morpho-sdk": minor
---

Add two read-only public-allocator liquidity metrics as `ReallocationData` methods.

- `ReallocationData.getPublicReallocationLiquidity(marketId, options?)`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Never throws on insufficiency (returns `0n`).
- `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, targetUtilization?, options?)`: liquidity available to bring a market to `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`) — the market's own borrow headroom plus the reallocatable liquidity scaled by `targetUtilization` (reallocated supply also raises the market's supply denominator, so only `targetUtilization · L` of it backs further borrow). Returns only the own headroom when `supplyTargetUtilization > targetUtilization`, and only the scaled liquidity when `targetUtilization` equals the current utilization.

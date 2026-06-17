---
"@morpho-org/morpho-sdk": minor
---

Add two read-only public-allocator liquidity metrics as `ReallocationData` methods.

- `ReallocationData.getAvailableLiquidity(marketId, options?)`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Never throws on insufficiency (returns `0n`).
- `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, utilization?, options?)`: liquidity available to bring a market to `utilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`) — the market's own borrow headroom plus the reallocatable liquidity. Returns only the own headroom when `supplyTargetUtilization > utilization`, and only the available liquidity when `utilization` equals the current utilization.

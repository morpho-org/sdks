---
"@morpho-org/morpho-sdk": minor
---

Add two read-only public-allocator liquidity metrics as `ReallocationData` methods.

- `ReallocationData.getPublicReallocationLiquidity(marketId, options?)`: total reallocatable liquidity into a market from sibling markets via the PublicAllocator. Never throws on insufficiency (returns `0n`).
- `ReallocationData.getAvailableLiquidityToTargetUtilization(marketId, targetUtilization?, options?)`: liquidity available to bring a market to `targetUtilization` (default `DEFAULT_SUPPLY_TARGET_UTILIZATION`) — the max borrow keeping post-borrow utilization at or below the target on the post-reallocation supply, i.e. `getBorrowToUtilization({ supply + L, borrow }, targetUtilization)`. Returns only the market's own borrow headroom when `supplyTargetUtilization > targetUtilization`, and `0n` when the market is already at or above the target and the reallocatable liquidity is too small to bring it back under.

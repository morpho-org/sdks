---
"@morpho-org/morpho-sdk": minor
---

Rename `ReallocationData.getAvailableLiquidityToTargetUtilization` to `getAvailableLiquidityToUtilization`, and its `targetUtilization` parameter to `utilization`.

The `target utilization` wording wrongly suggested a market's configured supply-target utilization, whereas the argument is just an arbitrary utilization ceiling the caller wants to bring the market to. Behavior is unchanged; only the method and parameter names differ.

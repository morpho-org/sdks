---
"@morpho-org/morpho-sdk": minor
---

Add `ReallocationData.getAvailableLiquidityToUtilization` (with a `utilization` parameter) and deprecate the previous `getAvailableLiquidityToTargetUtilization` / `targetUtilization` naming.

The `target utilization` wording wrongly suggested a market's configured supply-target utilization, whereas the argument is just an arbitrary utilization ceiling the caller wants to bring the market to. The old method is kept as a `@deprecated` alias that delegates to the new one (to be removed in the next major), so existing consumers keep working. Behavior is unchanged.

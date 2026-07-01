---
"@morpho-org/morpho-sdk": major
---

Remove the deprecated `ReallocationData.getAvailableLiquidityToTargetUtilization` alias. Use `getAvailableLiquidityToUtilization` instead — it has the same signature and behavior; only the method name (and its `targetUtilization` parameter, now `utilization`) changed.

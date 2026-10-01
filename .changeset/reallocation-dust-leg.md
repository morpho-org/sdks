---
"@morpho-org/morpho-sdk": patch
---

Account the target allocation as at least the requested assets after each accepted Vault V2 Blue reallocation leg, so a leg sized to an absolute cap leaves no rounding headroom and the planner no longer emits a 1-wei follow-up leg that reverts with AbsoluteCapExceeded().

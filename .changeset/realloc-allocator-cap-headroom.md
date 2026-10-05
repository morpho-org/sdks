---
"@morpho-org/morpho-sdk": minor
---

Operation reallocation plans no longer fill a BluePublicAllocator target cap. When a plan toward the 90% utilization target would come within `allocatorCapHeadroom` (new option, `DEFAULT_ALLOCATOR_CAP_HEADROOM` = 1% of the cap) of that cap, it moves only the operation's absolute shortfall, using the full cap only when the shortfall needs it. This prevents `AbsoluteCapExceeded()` reverts when another allocation to the market lands between quote and inclusion.

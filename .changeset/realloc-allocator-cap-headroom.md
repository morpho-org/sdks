---
"@morpho-org/morpho-sdk": minor
---

Operation reallocation plans no longer fill a BluePublicAllocator target cap. When a plan toward the 90% utilization target would come within `allocatorCapHeadroom` of that cap (new option; `DEFAULT_ALLOCATOR_CAP_HEADROOM` is 1% of the cap), the plan moves only the operation's absolute shortfall, or what vaults below their cap were already moving if that is more. It uses the full cap only when the shortfall needs it. The kept headroom prevents `AbsoluteCapExceeded()` reverts when another allocation of up to that size lands on the market between quote and inclusion.

---
"@morpho-org/morpho-sdk": major
---

Replace public allocator planning inputs with `ReallocationData`, moving reallocation computation off `simulation-sdk` state and adding explicit timestamp-driven reallocation options.

`ReallocationData.getMarketPublicReallocations` does not carry over the legacy `SimulationState.getMarketPublicReallocations` one-hour `delay` margin. It evaluates target-market vault headroom at `options.timestamp` (or the target market's `lastUpdate` when omitted), so callers that need inclusion-time safety should pass a future timestamp or reserve their own headroom.

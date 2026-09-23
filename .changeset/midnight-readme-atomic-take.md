---
"@morpho-org/midnight-sdk": patch
---

Replace the README multi-offer take recipe with an atomic `MidnightBundlesV1` route that carries the quote's aggregate `averageWorstPrice` guard, instead of independent `Midnight.take` transactions that could settle a partial fill outside the guard.

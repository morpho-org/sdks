---
"@morpho-org/midnight-sdk": patch
---

Correct `Offer.create` JSDoc for `continuousFeeCap`: the actual default is `0n` (fail-closed — no market continuous fee is accepted unless set explicitly), not `MAX_CONTINUOUS_FEE` as previously documented. No behavior change.

Refs SDK-1009

---
"@morpho-org/midnight-sdk": minor
---

Add `OfferChainUtils.buildLendFixedRateOfferChain`, `buildBorrowFixedRateOfferChain`, and `getMaxFixedRateOfferChainEndTimestamp` so the markets app can build adjacent, grouped offers that keep a maker's displayed fixed rate stable across a long selected window.

Expose a Midnight accrued position's currently withdrawable credit capacity.

Accept a single Midnight offer or group anywhere tree-shaped input is supported, including `Tree.from`, ratifier helpers, and mempool validation.

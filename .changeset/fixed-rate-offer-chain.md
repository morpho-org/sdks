---
"@morpho-org/midnight-sdk": minor
---

Add `OfferChainUtils.buildFixedRateOfferChain`, `buildLendFixedRateOfferChain`, `buildBorrowFixedRateOfferChain`, and `getMaxFixedRateOfferChainEndTimestamp` so the markets app can build adjacent, grouped offers that keep a maker's displayed fixed rate stable across a long selected window.

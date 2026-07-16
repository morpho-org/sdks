---
"@morpho-org/midnight-sdk": minor
---

Add `OfferChainUtils.buildLendFixedRateOfferChain`, `buildBorrowFixedRateOfferChain`, and `getMaxFixedRateOfferChainEndTimestamp` so the markets app can build adjacent, grouped offers that keep a maker's displayed fixed rate stable across a long selected window.

Expose a Midnight accrued position's currently withdrawable credit capacity.

Align Midnight positions with Blue's model: base positions require `user` and `marketId`, while accrued positions accept `user` plus a hydrated `market` and derive the market id. Retain both identifiers across local accrual so downstream transaction flows can bind snapshots to the correct account and market.

Move the position model and utilities into a dedicated `position` module matching Blue's source layout while preserving the package's root exports.

Accept a single Midnight offer or group anywhere tree-shaped input is supported, including `Tree.from`, ratifier helpers, and mempool validation.

---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

`MidnightApi` takeable-offer mappers (`fetchBookQuote`, `fetchBookTakeableOffers`, `fetchTakeableOffers`) now reject offers that cannot be executed by the Midnight contract: caps must set exactly one non-zero `uint128` cap, and buy offers must carry a zero `receiverIfMakerIsSeller`. Such responses throw `InvalidMidnightApiResponseError` instead of being quoted and skipped onchain, which could otherwise fall through to worse-priced liquidity.

`MidnightApi.fetchBookQuote` now throws the new `InvalidMidnightApiQuoteTargetError` when the runtime input does not set exactly one of `units` or `assets`, instead of sending both query parameters and silently evaluating the `units` branch. The error is re-exported from `@morpho-org/morpho-sdk/errors` and `@morpho-org/morpho-sdk/midnight/errors`.

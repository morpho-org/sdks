---
"@morpho-org/midnight-sdk": patch
---

`MidnightApi` takeable-offer mappers (`fetchBookQuote`, `fetchBookTakeableOffers`, `fetchTakeableOffers`) now reject offers that cannot be executed by the Midnight contract: caps must set exactly one non-zero `uint128` cap, and buy offers must carry a zero `receiverIfMakerIsSeller`. Such responses throw `InvalidMidnightApiResponseError` instead of being quoted and skipped onchain, which could otherwise fall through to worse-priced liquidity.

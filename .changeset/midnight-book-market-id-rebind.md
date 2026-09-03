---
"@morpho-org/midnight-sdk": patch
"@morpho-org/morpho-sdk": patch
---

Bind `MidnightApi.fetchBook` and `fetchBooks` results to the requested market. Both now recompute the market id from each returned book's own params with `MarketUtils.toId` and throw `InvalidMidnightApiResponseError` when it does not match the advertised `market_id`, so a hostile or compromised API cannot pair a trusted id with foreign market metadata. `fetchBook` additionally rejects a book whose id differs from the requested one, and `fetchBooks` rejects any book outside a supplied `marketIds` filter. This mirrors the derive-and-compare rebinding already enforced on the takeable-offers path. `morpho-sdk` re-exports this API via its `/midnight/api` facade and takes a matching patch so facade consumers resolve the fixed dependency.

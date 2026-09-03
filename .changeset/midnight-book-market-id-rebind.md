---
"@morpho-org/midnight-sdk": patch
---

Bind `MidnightApi.fetchBook` and `fetchBooks` results to the requested market. `fetchBook` now throws `InvalidMidnightApiResponseError` when the API returns a book whose `market_id` differs from the requested id, and `fetchBooks` rejects any returned book outside a supplied `marketIds` filter. This mirrors the request/response rebinding already enforced on the takeable-offers path, closing the gap where a hostile or compromised API could substitute a coherent foreign market for the requested one.

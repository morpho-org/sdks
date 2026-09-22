---
"@morpho-org/midnight-sdk": patch
"@morpho-org/morpho-sdk": patch
---

Reject `MidnightApi.fetchBooks` results outside the requested filters. `fetchBooks` now throws `InvalidMidnightApiResponseError` when a returned book falls outside any supplied `chainIds`, `loanTokens`, `collateralTokens`, or `maturities` filter, extending the existing `marketIds` binding so a hostile or compromised API cannot return a coherent foreign market for a filtered listing. `morpho-sdk` re-exports this API via its `/midnight-api` facade and takes a matching patch.

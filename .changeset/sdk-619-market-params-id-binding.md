---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

`fetchMarketParams` and `fetchMarket` (and callers that go through them) now throw `MarketParamsIdMismatchError` when RPC-returned market params do not hash to the requested id; all-zero params for uncreated markets remain accepted. Markets built directly from Vault V2 deployless query results are not covered by this check yet. `morpho-sdk` re-exports the error as `MarketParamsIdMismatchError` from `/blue/errors` and `BlueMarketParamsIdMismatchError` from `/errors`.

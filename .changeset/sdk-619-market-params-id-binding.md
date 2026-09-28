---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

Fetchers now throw `MarketParamsIdMismatchError` when RPC-returned market params do not hash to the requested id; all-zero params for uncreated markets remain accepted. `morpho-sdk` re-exports the error as `MarketParamsIdMismatchError` from `/blue/errors` and `BlueMarketParamsIdMismatchError` from `/errors`.

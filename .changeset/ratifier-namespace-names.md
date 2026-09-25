---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Expose ratifier namespaces as `EcrecoverRatifier`, `SetterRatifier`, `PriceRatifierV1`, `RateRatifierV1`, and `Ratifier`, and rename their implementation files accordingly. Preserve all previous `*Utils` exports. Price V1, Rate V1, and Ratifier keep identity-preserving deprecated aliases. Ecrecover and Setter retain their deprecated legacy APIs alongside the new tagged-tree APIs, sharing the signing and encoding implementation.

Expose the canonical names through `/midnight/utils` and their `Midnight`-qualified counterparts through `/utils`, retaining the `Midnight`-qualified facade aliases.

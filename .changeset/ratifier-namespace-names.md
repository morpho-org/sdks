---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Expose ratifier namespaces as `EcrecoverRatifier`, `SetterRatifier`, `PriceRatifierV1`, `RateRatifierV1`, and `Ratifier`, and rename their implementation files accordingly. Keep all previous `*Utils` exports as deprecated aliases to the same objects, preserving existing imports and function signatures.

Expose the canonical names through `/midnight/utils` and their `Midnight`-qualified counterparts through `/utils`, while retaining all existing facade aliases.

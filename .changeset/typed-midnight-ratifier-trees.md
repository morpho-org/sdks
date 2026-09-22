---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Add route-typed `Tree` construction for Ecrecover, Setter, PriceRatifierV1, and RateRatifierV1, with inferred leaf types, descriptor round-trips, and route-specific ratification and mempool validation. Preserve existing leaf hashes, roots, proofs, and ratifier payloads. Deprecate untagged `Tree.create(entries)` in favor of `Tree.create({ type, entries })`; existing untagged trees and ratifier descriptors remain supported.

Expose the new tree types through the Midnight entity facade and its qualified counterparts.

Preserve the original untagged `TreeLike`, `TreeInput`, `RatifierTreeInput`, and Price/Rate descriptor contracts. Add `TypedRatifierTreeInput<K>` for route-aware standard-ratifier inputs so existing wrapper functions continue to compile while new tagged trees receive route checks.

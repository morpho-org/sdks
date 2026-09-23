---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Derive `RateRatifierV1` and `PriceRatifierV1` default groups from the scheme's zero-group leaf hash so SDK payloads match the router's `group_identity` check. `buildDescriptor` now assigns the content-addressed singleton group (committing `rate`/`allowedTaker`) to leaves whose offer has no explicit `group`; explicit groups are committed as-is. Add `RateRatifierV1.memberHash`/`groupId`, `PriceRatifierV1.memberHash`/`groupId`, and the ratifier-agnostic `GroupUtils.hashMembers`.

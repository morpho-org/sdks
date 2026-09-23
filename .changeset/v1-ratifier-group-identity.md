---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Derive `RateRatifierV1` and `PriceRatifierV1` default groups from the scheme's zero-group leaf hash so SDK payloads match the router's `group_identity` check. `buildDescriptor` now assigns the content-addressed singleton group (committing `rate`/`allowedTaker`) to leaves whose offer has no explicit `group`; explicit groups are committed as-is. Add `RateRatifierV1.memberHash`/`groupId`, `PriceRatifierV1.memberHash`/`groupId`, and the ratifier-agnostic `GroupUtils.hashMembers`.

`RateRatifierV1.buildDescriptor` now throws `InvalidRateRatifierV1TickError` when a leaf offer commits a nominal `tick` below `RateRatifierV1.MIN_TICK` (3372, price 0.5 WAD): the router prices Rate offers from `rate` but its gatekeeper still rejects lower committed ticks as `min_tick`.

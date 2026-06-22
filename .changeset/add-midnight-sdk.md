---
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities under a dedicated `@morpho-org/midnight-sdk/api` subpath.

The initial surface includes pinned Midnight ABI literals, ABI-compatible market/position/offer values, `MarketParams.from`, `Offer.create`, `Offer.from`, `Group`, `Group.from`, `Tree`, and `Tree.from` class APIs, object-compatible `MarketUtils`, `OfferUtils`, `GroupUtils`, and `TreeUtils` helpers, tree mempool validation through `Tree.mempoolValidate`, tick and units/assets math helpers, viem-backed fetch helpers with deployless position reads, ratifier classification, Ecrecover/Setter ratifier data codecs, local offer-proof verification, raw mempool payload encoding/decoding, and Midnight public API book/quote/takeable-offer/validation helpers.

The payload codec rejects non-padding offer bytes unless exactly one of `maxUnits` and `maxAssets` is non-zero.

Payload collateral validation mirrors `Midnight.touchMarket` by rejecting zero collateral tokens and `maxLif` values outside the low/high liquidation cursor formulas.

Offer creation and payload validation require `expiry` to be strictly greater than `start`, so SDK-built offers cannot later fail payload encoding on a zero-duration time range.

Ecrecover ratification rejects trees whose offers span multiple makers, so one maker signature cannot produce payload items for another maker's leaves.

Offer creation only accepts protocol-reachable tick spacings and offer groups require a shared cap mode and value, matching Midnight's tick accessibility and group consumption accounting.

Tick math constants mirror the current Midnight protocol range and price quantum.

The package consumes shared primitives, `MathLib`, typed errors, and registry data from `@morpho-org/morpho-ts`, and exposes a configurable `MidnightApi` client from `@morpho-org/midnight-sdk/api` with a `https://api.morpho.org` default and optional string-or-`URL` `baseUrl` override.

`MidnightApi` uses explicit TypeScript interfaces with viem `Address`, `Hash`, and `Hex` primitives for the HTTP boundary; caller inputs are trusted at runtime and forwarded according to those types.

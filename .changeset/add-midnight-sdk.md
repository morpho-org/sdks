---
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities under a dedicated `@morpho-org/midnight-sdk/api` subpath.

The initial surface includes pinned Midnight ABI literals, ABI-compatible market/position/offer values, `MarketParams.from`, `Offer.create`, `Offer.from`, `Group`, `Group.from`, `Tree`, and `Tree.from` class APIs, object-compatible `MarketUtils`, `OfferUtils`, `GroupUtils`, and `TreeUtils` helpers, tick and units/assets math helpers, viem-backed fetch helpers with deployless position reads, ratifier classification, Ecrecover/Setter ratifier data codecs, local offer-proof verification, raw mempool payload encoding/decoding, and Midnight public API book/quote/takeable-offer/validation/rules helpers.

The payload codec rejects non-padding offer bytes unless exactly one of `maxUnits` and `maxAssets` is non-zero.

Offer creation and payload validation require `expiry` to be strictly greater than `start`, so SDK-built offers cannot later fail payload encoding on a zero-duration time range.

The package consumes shared primitives, `MathLib`, typed errors, and registry data from `@morpho-org/morpho-ts`, and exposes a configurable `MidnightApi` client from `@morpho-org/midnight-sdk/api` with a `https://api.morpho.org` default and optional string-or-`URL` `baseUrl` override.

`MidnightApi` uses explicit TypeScript interfaces with viem `Address`, `Hash`, and `Hex` primitives for the HTTP boundary; caller inputs are trusted at runtime and forwarded according to those types.

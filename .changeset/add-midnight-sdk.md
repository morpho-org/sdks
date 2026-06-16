---
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities.

The initial surface includes pinned Midnight ABI literals, ABI-compatible market/position/offer values, `Offer.create`, `TakeableOffer.createMany`, `Group`, and `Tree` class APIs, object-compatible `OfferUtils`, `TakeableOfferUtils`, `GroupUtils`, `TreeUtils`, and `OfferTreeUtils` helpers, tick and units/assets math helpers, viem-backed fetch helpers with deployless position reads, ratifier classification, Ecrecover/Setter ratifier data codecs, local offer-proof verification, root approval/cancellation descriptors, raw mempool payload encoding/decoding plus submission-call helpers, and Midnight public API book/quote/takeable-offer/validation/rules helpers.

The package consumes shared primitives, `MathLib`, typed errors, and registry data from `@morpho-org/morpho-ts`, and exposes a configurable `MidnightApi` client with a `https://api.morpho.org` default and optional string-or-`URL` `baseUrl` override.

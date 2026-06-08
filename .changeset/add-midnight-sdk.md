---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a framework-agnostic Midnight protocol utility package. The initial surface includes pinned public ABI fragments for integrator-owned calldata encoding, address-registry and dynamic custom-registration helpers, ABI-compatible market/offer values and takeable-offer shapes, `Offer.create` / `TakeableOffer.createMany` / `Group` / `Tree` class APIs, object-compatible `OfferUtils`, `TakeableOfferUtils`, `GroupUtils`, `TreeUtils`, and `OfferTreeUtils` helpers, tick and units/assets math helpers, viem-backed fetch helpers with deployless composite reads, ratifier classification, Ecrecover/Setter ratifier classes and ratifier-data codecs, local offer-proof verification, root approval/cancellation descriptors, raw mempool payload encoding/decoding plus submission-call helpers, and Midnight public API validation/rules helpers with a `https://api.morpho.org` default, tree validation before ratifier data exists, an `Api.init()` wrapper, and optional string-or-`URL` `baseUrl` override.

Extract the full `MathLib` fixed-point arithmetic namespace to `@morpho-org/morpho-ts`, re-export it from `@morpho-org/blue-sdk` for compatibility, and consume it directly from `@morpho-org/morpho-ts` in `@morpho-org/midnight-sdk`.

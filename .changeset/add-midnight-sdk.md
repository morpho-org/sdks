---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a framework-agnostic Midnight protocol utility package. The initial surface includes pinned public ABI fragments including `MidnightBundles` for integrator-owned calldata encoding, address-registry and dynamic custom-registration helpers, ABI-compatible market/offer values and takeable-offer shapes, reusable upfront make-offer parameter validation helpers, protocol-only offer-group helpers, `Group`/`Tree` classes for offer-tree DX, tick and units/assets math helpers, viem-backed fetch helpers with deployless composite reads, pure requirement planners, ratifier classification, `OfferTreeUtils`, Ecrecover/Setter ratifier classes and ratifier-data codecs, local offer-proof verification, root approval/cancellation descriptors, raw mempool payload encoding/decoding plus submission-call helpers, and Midnight router API validation/rules helpers with a `https://router.morpho.org` default, tree validation before ratifier data exists, an `Api.init()` wrapper, and optional string-or-`URL` `baseUrl` override.

Extract the full `MathLib` fixed-point arithmetic namespace to `@morpho-org/morpho-ts`, re-export it from `@morpho-org/blue-sdk` for compatibility, and consume it directly from `@morpho-org/morpho-ts` in `@morpho-org/midnight-sdk`.

---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a framework-agnostic Midnight protocol utility package. The initial surface includes pinned ABI fragments including `MidnightBundles`, address-registry and dynamic custom-registration helpers, ABI-compatible market/offer/take value classes with `from(...)` factories, reusable upfront make-offer parameter validation helpers, protocol-only offer-group helpers, tick and units/assets math helpers, direct Midnight calldata encoders, viem-backed fetch helpers with deployless composite reads, pure requirement planners, ratifier classification, offer-tree hashing/signature descriptors, Ecrecover/Setter ratifier-data codecs, local offer-proof verification, root approval/cancellation descriptors, raw mempool payload encoding/decoding, and Midnight router API validation/rules helpers with a `https://router.morpho.org` default and optional string-or-`URL` `url` override.

Extract the full `MathLib` fixed-point arithmetic namespace to `@morpho-org/morpho-ts`, re-export it from `@morpho-org/blue-sdk` for compatibility, and consume it directly from `@morpho-org/morpho-ts` in `@morpho-org/midnight-sdk`.

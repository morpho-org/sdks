---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a framework-agnostic Midnight protocol utility package. The initial surface includes pinned ABI fragments, address-registry helpers, ABI-compatible market/offer/take value classes with `from(...)` factories, tick and units/assets math helpers, MidnightBundles and direct Midnight calldata encoders, viem-backed fetch helpers, pure requirement planners, ratifier classification, offer-tree hashing/signature descriptors, and payload-validation wrappers.

Extract the full `MathLib` fixed-point arithmetic namespace to `@morpho-org/morpho-ts`, re-export it from `@morpho-org/blue-sdk` for compatibility, and consume it directly from `@morpho-org/morpho-ts` in `@morpho-org/midnight-sdk`.

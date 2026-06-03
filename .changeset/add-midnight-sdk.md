---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a framework-agnostic Midnight protocol utility package. The initial surface includes pinned ABI fragments, address-registry helpers, ABI-compatible market/offer/take value classes, tick and units/assets math helpers, MidnightBundles and direct Midnight calldata encoders, viem-backed fetch helpers, pure requirement planners, ratifier classification, offer-tree hashing/signature descriptors, and payload-validation wrappers.

Add shared `WAD`, `ORACLE_PRICE_SCALE`, and bigint math helpers to `@morpho-org/morpho-ts`, and source the existing Blue SDK fixed-point constants and shared math operations from those exports without changing their values.

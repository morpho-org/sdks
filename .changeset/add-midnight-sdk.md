---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": patch
"@morpho-org/midnight-sdk": minor
---

Add `@morpho-org/midnight-sdk` as a framework-agnostic Midnight protocol utility package. The initial surface includes pinned ABI fragments, address-registry helpers, normalized market/offer/take value classes, tick and units/assets math helpers, MidnightBundles and direct Midnight calldata encoders, viem-backed fetch helpers, pure requirement planners, ratifier classification, offer-tree hashing/signature descriptors, and payload-validation wrappers.

Add shared `WAD` and `ORACLE_PRICE_SCALE` constants to `@morpho-org/morpho-ts`, and source the existing Blue SDK fixed-point constants from those shared exports without changing their values.

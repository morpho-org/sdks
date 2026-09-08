---
"@morpho-org/liquidity-sdk-viem": patch
---

Restrict the `@morpho-org/morpho-sdk` peer dependency to v5 because liquidity calculations still
rely on the PublicAllocator V1 APIs removed in morpho-sdk v6.

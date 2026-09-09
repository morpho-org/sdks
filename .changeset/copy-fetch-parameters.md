---
"@morpho-org/blue-sdk-viem": patch
---

Stop mutating caller-owned fetch `parameters` objects: every fetcher now defaults `chainId`/`deployless` on its own copy, so a shared options object reused across clients or chains is no longer silently pinned to the first resolved chain id.

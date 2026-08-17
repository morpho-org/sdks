---
"@morpho-org/liquidity-sdk-viem": minor
---

Add an independent REST-backed `VaultV2LiquidityLoader` alongside the existing Vault V1 loader. It validates successful API payloads at runtime, pins REST and RPC hydration to one indexed block, anchors live REST market totals to that block's timestamp to prevent double accrual, and fails explicitly on incomplete positions instead of treating missing state as zero. Raise its `blue-sdk`, `blue-sdk-viem`, `morpho-sdk`, and `morpho-ts` peer floors to the introducing versions.

---
"@morpho-org/migration-sdk-viem": patch
---

Always sweep residual destination loan tokens to the user after the source repay, and set `skipRevert=true` only on the morphoRepay cleanup so unrelated steps still surface failures

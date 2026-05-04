---
"@morpho-org/morpho-sdk": minor
---

`computeReallocations` now throws `InsufficientSharedLiquidityError` when the selected vault withdrawals do not fully cover the target market's borrow shortfall, instead of returning a fee-bearing partial plan whose downstream `morphoBorrow` would still revert onchain. Mirrors the feasibility check `populateBundle` already enforces in `@morpho-org/bundler-sdk-viem`. Addresses Cantina audit finding MORP2-28 (informational).

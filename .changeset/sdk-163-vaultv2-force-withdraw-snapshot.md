---
"@morpho-org/morpho-sdk": patch
---

`vaultV2ForceWithdraw` now snapshots `withdraw.amount` and `withdraw.recipient` once at entry instead of reading them from the input object three times. A getter- or `Proxy`-backed `withdraw` could previously return a safe value during validation and a larger value during calldata encoding, letting the encoded multicall withdraw more than the value the builder validated. Validation, calldata, and the returned `action.args.withdraw` now all use the same snapshotted values. Addresses Cantina audit finding MORP2-15 (informational).

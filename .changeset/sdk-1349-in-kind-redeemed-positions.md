---
"@morpho-org/evm-simulation": minor
---

Verify the Blue supply position an in-kind vault redemption credits. `vaultV1InKindRedeem` and `vaultV2InKindRedeem` limits accept an optional `marketId`; with it, `quote.sharesMinted` is checked against the account's supply shares in that market. Add one limit entry per market. Without `marketId`, quoting `sharesMinted` on an in-kind limit is rejected.

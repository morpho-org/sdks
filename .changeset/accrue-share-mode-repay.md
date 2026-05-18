---
"@morpho-org/morpho-sdk": patch
---

Fix MarketV1 share-mode `repay` and `repayWithdrawCollateral` reverting on dormant markets: `transferAmount` and `maxSharePrice` are now sized from the accrued market snapshot instead of the stale `lastUpdate` state, so full-repay matches its accrual-immune contract.

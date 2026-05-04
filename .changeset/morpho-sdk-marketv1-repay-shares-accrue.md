---
"@morpho-org/morpho-sdk": patch
---

`MorphoMarketV1.repay({ shares })` and `MorphoMarketV1.repayWithdrawCollateral({ shares })` now size `transferAmount` and `maxSharePrice` from a market projected 2 h forward, fixing share-mode full-repay reverts on dormant markets where `lastUpdate` lagged the current block. Residual loan tokens are skimmed back to the receiver so over-buffering is safe. `slippageTolerance` still applies on top of the projection for `maxSharePrice` only. Assets-mode behavior is unchanged: the post-repay LLTV check on `repayWithdrawCollateral` keeps the previous +10 min buffer to avoid silently tightening health on caller-supplied fixed amounts.

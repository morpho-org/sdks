---
"@morpho-org/morpho-sdk": patch
---

Fix assets-mode repay reverting on quiet markets. `MorphoBlue.repay` and
`MorphoBlue.repayWithdrawCollateral` now derive `maxSharePrice` from the
2h-forward-accrued market in **both** repay modes, not just shares mode.

Previously the assets path computed the slippage bound from the un-accrued
`positionData.market` snapshot (as of the market's on-chain `lastUpdate`),
while on-chain `morphoRepay` accrues interest `lastUpdate → execution` before
enforcing the bound. On a market that hasn't accrued recently, the accrued
borrow share price rose past the default 0.03% `slippageTolerance` ceiling and
the bundle reverted — e.g. at ~8% APR, 0.03% is only ~1.3 days of accrual, so a
quiet market reverted systematically. Direct core `repay` (no bundler, no
bound) was unaffected, which is why the fallback path succeeded while
app.morpho.org did not.

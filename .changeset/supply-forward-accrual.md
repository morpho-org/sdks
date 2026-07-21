---
"@morpho-org/morpho-sdk": patch
---

Fix loan-asset supply reverting on quiet markets. `MorphoBlue.supply` now
derives `maxSharePrice` from the 2h-forward-accrued market instead of the raw
`marketData` snapshot.

Previously the supply path computed the slippage bound from the un-accrued
`marketData` snapshot (as of the market's on-chain `lastUpdate`), while on-chain
`morphoSupply` accrues interest `lastUpdate → execution` before enforcing the
bound. Accrual raises the supply share price, so on a market that hasn't accrued
recently the accrued price rose past the default 0.03% `slippageTolerance`
ceiling and the bundle reverted on `maxSharePrice` — e.g. at ~10% APR / 90%
utilization, ~0.03% is only a few days of accrual, so a quiet market reverted
systematically. This is the supply counterpart of the repay fix (VAU-1206); the
`withdraw` / `borrow` paths use a lower `minSharePrice` bound that accrual only
relaxes, so they were unaffected.

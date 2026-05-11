---
"@morpho-org/simulation-sdk": patch
---

Align `Blue_Borrow` and `Blue_Withdraw` simulators with the onchain `minSharePrice = WAD - slippage` floor enforced by `GeneralAdapter1.morphoBorrow` / `morphoWithdraw`. Worst-case shares/assets are now booked with `wDivUp` / `wMulDown` against `WAD - slippage`, so simulation no longer under-credits debt or under-debits supply within the configured slippage window. The central `Blue_*` slippage guard now also rejects `slippage === WAD` (would otherwise divide by zero) via `SimulationErrors.InvalidInput`.

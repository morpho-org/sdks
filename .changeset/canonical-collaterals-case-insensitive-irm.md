---
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/midnight-sdk": patch
"@morpho-org/morpho-sdk": patch
---

`fetchMarket` and `fetchAccrualVaultV2` now detect the Adaptive Curve IRM case-insensitively, so `rateAtTarget` is populated on deployments whose registry entry is not checksummed.

`MidnightApi.fetchBook` / `fetchBooks` now return `collaterals` in the protocol's canonical order, so the array index matches the onchain `collateralIndex` used by Midnight actions.

---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-sdk": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Forward `AccrualVaultV2.accrueInterest` now also accrues contributing nested adapters, markets, and positions, using an optional backward-compatible `accrueInterest(timestamp)` method on `IAccrualVaultV2Adapter` implemented by built-in adapters. Adapters without it, zero-share or zero-allocation nested state, and markets already ahead of the timestamp keep their snapshots; vault-level totals and fee shares remain unchanged.

Accrual at or before the vault's `lastUpdate` returns an unchanged copy without touching nested adapters.

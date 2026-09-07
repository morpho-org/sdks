---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Accrue every underlying adapter, market, and position when accruing a Vault V2, so `AccrualVaultV2.accrueInterest` returns an entity graph whose entire nested state shares one `lastUpdate` — aligning Vault V2 with the existing MetaMorpho V1 (`AccrualVault.accrueInterest`) behavior, rather than leaving nested adapters at pre-accrual state. Adds a backward-compatible optional `accrueInterest(timestamp)` method to the `IAccrualVaultV2Adapter` interface — adapters that do not implement it are left at their pre-accrual state — and implements it on each built-in adapter. Vault-level `_totalAssets`, `totalSupply`, and fee shares are byte-for-byte unchanged.

To stay backward compatible, `AccrualVaultV2.accrueInterest(timestamp)` also leaves an adapter at its pre-accrual state when `timestamp` is behind one of its markets (a market cannot be accrued backwards), rather than throwing: a `timestamp === vault.lastUpdate` call keeps working even when a nested market was poked more recently, exactly as before. When `timestamp` is strictly greater than the vault's `lastUpdate`, computing accrued total assets still accrues every market to `timestamp` and requires `timestamp >= market.lastUpdate`, as it always has.

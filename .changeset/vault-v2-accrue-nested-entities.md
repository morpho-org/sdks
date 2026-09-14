---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Accrue every underlying adapter, market, and position when accruing a Vault V2, so `AccrualVaultV2.accrueInterest` returns an entity graph whose entire nested state shares one `lastUpdate` — aligning Vault V2 with the existing MetaMorpho V1 (`AccrualVault.accrueInterest`) behavior, rather than leaving nested adapters at pre-accrual state. Adds a backward-compatible optional `accrueInterest(timestamp)` method to the `IAccrualVaultV2Adapter` interface — adapters that do not implement it are left at their pre-accrual state — and implements it on each built-in adapter. Vault-level `_totalAssets`, `totalSupply`, and fee shares are byte-for-byte unchanged.

To stay backward compatible, a no-op `timestamp === vault.lastUpdate` accrual keeps working exactly as before: it returns without failing even when a nested market was poked more recently (a market cannot be accrued backwards, `BlueErrors.InvalidInterestAccrual`) or a nested Vault V1 withdraw queue is stale (`UnknownMarketAllocationError`), leaving that adapter at its pre-accrual state. This tolerance is limited to the no-op case — when `timestamp` is strictly greater than the vault's `lastUpdate`, advancing the graph requires every nested market to reach `timestamp`, so a market that cannot (whether ahead of `timestamp` or backed by a stale queue) surfaces its error instead of yielding a silent mixed-timestamp graph. Zero-allocation Vault V1 adapters are left untouched — their `realAssets` is `0n` regardless — so advancing a vault never accrues, nor throws for, an economically inactive adapter's markets, exactly as before.

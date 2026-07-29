---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Accrue every underlying adapter, market, and position when accruing a Vault V2, so `AccrualVaultV2.accrueInterest` returns an entity graph whose entire nested state shares one `lastUpdate` — aligning Vault V2 with the existing MetaMorpho V1 (`AccrualVault.accrueInterest`) behavior, rather than leaving nested adapters at pre-accrual state. Adds an additive `accrueInterest(timestamp?)` method to the `IAccrualVaultV2Adapter` interface and each adapter implementation. Vault-level `_totalAssets`, `totalSupply`, and fee shares are byte-for-byte unchanged.

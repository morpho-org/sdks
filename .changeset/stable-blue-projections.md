---
"@morpho-org/blue-sdk": patch
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": patch
---

Preserve immutable Blue collateral projections and use block-aligned, fee-accrued Vault V1 state for migration bounds.

`fetchAccrualVault` and `fetchAccrualVaultV2MorphoVaultV1Adapter` now reject `blockTag: "pending"` because a pending block cannot anchor a consistent snapshot. This is an intentional incompatibility in the `@morpho-org/blue-sdk-viem` minor release.

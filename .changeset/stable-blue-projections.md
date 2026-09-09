---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

Preserve immutable Blue collateral projections, use block-aligned fee-accrued Vault V1 state for migration bounds, and ignore residual nested-vault shares when their parent allocation is zero.

`fetchAccrualVault` and `fetchAccrualVaultV2MorphoVaultV1Adapter` now reject `blockTag: "pending"` because a pending block cannot anchor a consistent snapshot. This is an intentional incompatibility in the `@morpho-org/blue-sdk-viem` minor release.

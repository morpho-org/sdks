---
"@morpho-org/morpho-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Vault V1/V2 `withdraw` and asset-mode Vault V1 `migrateToV2` no longer request a new share approval when the live VaultBundlesV1 allowance is above the computed cap by at most one slippage tolerance (`cap <= allowance <= cap / (1 - slippageTolerance)`). A Safe approval that executes after the app has re-prepared the exit from a fresher vault snapshot previously missed the slightly different cap, so the app kept asking for a new approval. Allowances above that range are still reset to the exact cap, and share-denominated exits (`redeem`, shares-mode `migrateToV2`) still require an exact match.

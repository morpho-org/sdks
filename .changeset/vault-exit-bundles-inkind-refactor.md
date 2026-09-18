---
"@morpho-org/morpho-sdk": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Reuse the shared bundles permit converter for VaultExitBundlesV1 in-kind redemptions with strict
permit validation.

Use `computeVaultMaxShareAllowance` for VaultV1 in-kind redemption requirements. The cap rounds
shares up, includes pending performance-fee dilution, and adds the default 0.03% loss buffer for
MetaMorpho 1.0 while preserving MetaMorpho 1.1's lost-assets clamp. Both approval and permit
requirements use this cap. In-kind redemptions continue to call VaultExitBundlesV1.

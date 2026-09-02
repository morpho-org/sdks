---
"@morpho-org/morpho-sdk": minor
---

Add bundles-compatible `userAddress` inputs to the Vault V1 and Vault V2 deposit, withdraw, and
redeem action builders, and to the Vault V1-to-Vault V2 migration builder. Keep the existing
`recipient`, `onBehalf`, and `minSharePriceVaultV1` inputs working but mark them deprecated for one
published minor before their planned removal in morpho-sdk v6.

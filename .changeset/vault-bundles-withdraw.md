---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Route Vault V1 and Vault V2 asset withdrawals through VaultBundlesV1 with exact share-allowance requirements, deadline-aware share caps, referral fees, and reusable prepared withdrawal handles. The share allowance is the only onchain cap on the burn, so an allowance that does not equal the derived cap — including a larger leftover approval — is replaced instead of reused, and `getRequirements()` re-validates the deadline on every call. The WDK adapter forwards its configured `slippageTolerance` to vault withdrawals.

---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
---

Route Vault V1 and Vault V2 asset withdrawals through VaultBundlesV1 with exact share-allowance requirements, deadline-aware share caps, referral fees, and reusable prepared withdrawal handles. The share allowance is the only onchain cap on the burn, so an allowance that does not equal the derived cap — including a larger leftover approval — is replaced instead of reused, and `getRequirements()` re-reads the live share allowance and re-validates the deadline on every call, so an approval executed between calls is no longer reported as outstanding. The WDK adapter forwards its configured `slippageTolerance` to vault withdrawals, and its immediate `withdraw(options)` now resolves that requirement before submitting, throwing the new `UnresolvedVaultWithdrawRequirementsError` unless the exact allowance is already in place.

---
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
---

Add a `bundles` group to `ChainAddresses` for standalone bundle periphery contracts, starting with
`bundles.vaultExitBundlesV1`. The `AddressLabel` union gains `bundles.vaultExitBundlesV1`, so
`getChainAddress(chainId, "bundles.vaultExitBundlesV1")` and `registerCustomAddresses` resolve the
new entry like any other registry address. The field is optional and unset on every live chain until
`VaultExitBundlesV1` ships, so fork tests register the deployed address at runtime.

Add Vault V1 and Vault V2 in-kind redemption actions and entity methods backed by
VaultExitBundlesV1, including max-share permit/approval requirements, Vault V2's two-field permit
domain, snapshot coverage validation, Morpho Blue balance checks, and Vault V2 gate checks.
Add a minimal Vault V2 preview helper for frontend eligibility, market capacity, and proceeds.
The published ABI and fork deployment fixture pin the guarded upstream contract at
`a531f7126f482eaeb57e7d8073e9afb718477bae`.

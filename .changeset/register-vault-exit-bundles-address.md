---
"@morpho-org/morpho-ts": minor
---

Add a `bundles` group to `ChainAddresses` for standalone bundle periphery contracts, starting with
`bundles.vaultExitBundlesV1`. The `AddressLabel` union gains `bundles.vaultExitBundlesV1`, so
`getChainAddress(chainId, "bundles.vaultExitBundlesV1")` and `registerCustomAddresses` resolve the
new entry like any other registry address. The field is optional and unset on every live chain until
`VaultExitBundlesV1` ships, so fork tests register the deployed address at runtime.

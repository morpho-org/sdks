---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
---

Register the canonical `VaultExitBundlesV1`, `VaultBundlesV1`, and `BlueBundlesV1` deployments in the
`bundles` group of `ChainAddresses` for Arc (chain 5042), matching the layout already exposed on the
other supported chains. `getChainAddress(ChainId.ArcMainnet, "bundles.vaultExitBundlesV1")`,
`getChainAddress(ChainId.ArcMainnet, "bundles.vaultBundlesV1")`, and
`getChainAddress(ChainId.ArcMainnet, "bundles.blueBundlesV1")` now resolve the new entries, and the
deployment-block registry records the `VaultExitBundlesV1` creation block. Addresses are sourced
byte-for-byte from the canonical deployment registry (morpho-org/deployments address-book.json).

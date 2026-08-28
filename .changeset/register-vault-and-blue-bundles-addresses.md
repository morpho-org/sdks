---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
---

Register the canonical `VaultBundlesV1` and `BlueBundlesV1` deployments in the `bundles` group of
`ChainAddresses`, alongside the existing `bundles.vaultExitBundlesV1` entry. The `AddressLabel`
union gains `bundles.vaultBundlesV1` and `bundles.blueBundlesV1`, so
`getChainAddress(chainId, "bundles.vaultBundlesV1")`,
`getChainAddress(chainId, "bundles.blueBundlesV1")`, and `registerCustomAddresses` resolve the new
entries like any other registry address. Both fields are optional so chains that only expose
`vaultExitBundlesV1` remain valid.

Addresses are sourced from the canonical deployment registry
(`morpho-org/deployments` `address-book.json`) and cover Ethereum, Base, Arbitrum, Optimism,
Polygon, World Chain, Unichain, HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain — the
same thirteen chains that already register `VaultExitBundlesV1`.

Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their
latest releases resolve the new registry entries.

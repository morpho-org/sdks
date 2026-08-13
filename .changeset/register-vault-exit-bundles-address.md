---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
---

Add a `bundles` group to `ChainAddresses` for standalone bundle periphery contracts, starting with
`bundles.vaultExitBundlesV1`. The `AddressLabel` union gains `bundles.vaultExitBundlesV1`, so
`getChainAddress(chainId, "bundles.vaultExitBundlesV1")` and `registerCustomAddresses` resolve the
new entry like any other registry address. Register the canonical `VaultExitBundlesV1` deployments
and deployment blocks on Ethereum, Base, Arbitrum, Optimism, Polygon, World Chain, Unichain,
HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain.

Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their
latest releases resolve the new registry entry.

Add Vault V1 and Vault V2 in-kind redemption actions and entity methods backed by
VaultExitBundlesV1, including bounded share permit/approval requirements, Vault V2's two-field
permit domain, snapshot coverage validation, and Morpho Blue balance checks.
Vault V2's `toShares` now accepts an optional rounding direction so callers can reproduce its
rounded-up withdrawal preview without duplicating share-conversion math.
Vault V1 exits also reject vaults configured as Morpho Blue's fee recipient, which the periphery
cannot safely account for when protocol fee shares accrue.
Add a minimal Vault V2 preview helper for frontend eligibility, market capacity, and proceeds.
Match the deployed contract at upstream commit `9994e6abe5b18d5f7e0d6bd666f85eb259e3312f`,
including its idle-assets-first Vault V2 exit behavior. The deployed ABI is unchanged. Fork tests
now use the canonical Ethereum deployment directly.

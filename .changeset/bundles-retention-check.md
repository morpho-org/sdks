---
"@morpho-org/evm-simulation": patch
---

Extend the simulation retention check to also guard the standalone `bundles` periphery contracts (`VaultExitBundlesV1`, `VaultBundlesV1`, `BlueBundlesV1`) from the blue-sdk address registry, alongside the existing `bundler3` executor and adapters. Net `(address, token)` retention above `DUST_THRESHOLD` in any of these restricted contracts now raises `BlacklistViolationError`. Chains are skipped only when blue-sdk catalogs neither a `bundler3` nor a `bundles` config.

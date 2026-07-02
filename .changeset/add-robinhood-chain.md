---
"@morpho-org/morpho-ts": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/morpho-sdk": patch
---

Add Robinhood Chain (chain id 4663) to the shared chain and address registries.

Register the `ChainId.RobinhoodMainnet` enum member, its explorer/native-currency metadata, and its era-2 Morpho Blue, AdaptiveCurveIrm, Bundler3, VaultV2, adapter-factory, registry, oracle-factory, pre-liquidation-factory, and wrapped-native addresses (sourced from the `morpho-org/deployments` address book).

Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

# Migrating from morpho-ts v2 to v3

Version 3 removes deprecated aliases and the registry data for retired Bundler3, migration-adapter,
Vault V1 PublicAllocator, and legacy MORPHO-wrapping integrations. The standalone bundle contracts
remain available under `bundles`.

## Address and deployment registries

| v2 | v3 |
| --- | --- |
| `addresses[chainId].morpho` | `addresses[chainId].blue` |
| `deployments[chainId].morpho` | `deployments[chainId].blue` |
| `addresses[chainId].bundler3` / `deployments[chainId].bundler3` | Use the applicable `bundles.blueBundlesV1`, `bundles.vaultBundlesV1`, or `bundles.vaultExitBundlesV1` route. There is no arbitrary Bundler3-composition replacement. |
| `vaultV1PublicAllocator` / `publicAllocator` | Migrate the integration to Vault V2, then use `vaultV2BluePublicAllocator`. The V2 allocator is not a drop-in address replacement for a Vault V1 flow. |
| `morphoToken` | Use the current MORPHO token directly; the SDK no longer carries the legacy token address used by the wrapper flow. |

Bundler3 adapter entries, including the Aave and Compound migration adapters, are removed from both
registries. Consumers that still need those retired contracts must pin morpho-ts v2 and maintain
their own registry.

Custom-chain inputs to `registerCustomAddresses` must now provide `blue` and `adaptiveCurveIrm`.
Replace a custom entry's `morpho` key with `blue`, and remove its retired `bundler3`, migration
adapter, Vault V1 PublicAllocator, and legacy MORPHO token fields.

## Removed aliases and utilities

| Removed | Replacement |
| --- | --- |
| `vaultV1AdapterAbi` | `morphoVaultV1AdapterAbi` |
| `vaultV1AdapterFactoryAbi` | `morphoVaultV1AdapterFactoryAbi` |
| `vaultV1PublicAllocatorAbi`, `publicAllocatorAbi` | Migrate to Vault V2 and use `vaultV2BluePublicAllocatorAbi`. |
| `WithId<T>` | `T & { id: string }` |
| `WithIndex<T>` | `T & { index: number }` |
| `CDN_BASE_URL`, `OPTIMIZERS_BASE_URL`, `OPTIMIZERS_API_BASE_URL` | Supply the URL from the consuming service. |

## Deprecation-window exception

The Bundler3 executor, GeneralAdapter1, Paraswap adapter, and Aave and Compound migration-adapter
registry entries were stable v2 fields without a prior published deprecation. Their removal is an
intentional breaking change in v3. Stay on v2 when arbitrary Bundler3 or migration-adapter access is
still required.

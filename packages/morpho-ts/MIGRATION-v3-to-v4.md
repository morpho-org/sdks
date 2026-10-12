# Migrating from morpho-ts v3 to v4

Version 4 removes the MidnightBundles (V1) registry data. Midnight taker flows now use
MidnightBundlesV2 ([ADR-2026-10-02](../../docs/adrs/ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md)).

| v3 | v4 |
| --- | --- |
| `addresses[chainId].midnightBundles` / `getChainAddress(chainId, "midnightBundles")` | `midnightBundlesV2` (register it with `registerCustomAddresses` where the registry has no entry yet) |
| `deployments[chainId].midnightBundles` | Removed |

Remove `midnightBundles` from custom `registerCustomAddresses` entries. Integrations that still call
V1 must pin morpho-ts v3.

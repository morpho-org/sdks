# Migrating from blue-sdk v7 to v8

blue-sdk v8 re-exports the morpho-ts v4 address and deployment registries, which drop the
MidnightBundles (V1) `midnightBundles` key. Use `midnightBundlesV2` instead, and see
[morpho-ts MIGRATION-v3-to-v4](../morpho-ts/MIGRATION-v3-to-v4.md). blue-sdk v8 requires
`@morpho-org/morpho-ts` ^4. Integrations that still call V1 must pin blue-sdk v7.

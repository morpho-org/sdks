---
"@morpho-org/morpho-sdk": minor
---

Export `getRequirementsAction` on the public surface. The helper encodes a pre-signed permit / permit2 requirement followed by a transfer to an arbitrary `recipient`, and was previously `@internal` (reachable only via deep dist paths). Exposing it lets action builders outside this package — e.g. the Aave V3 → Vault V2 migration in `morpho-apps` — route the pulled asset to a non-default recipient such as `AaveV3CoreMigrationAdapter`, without copying the permit/permit2 encoding logic.

---
"@morpho-org/morpho-sdk": major
---

Remove MidnightBundles (V1) support: `midnightBundlesAbi` is no longer re-exported, `"midnightBundles"` is dropped from `RequirementSpenderKey` and from the approval, permit and Midnight authorization allowlists, and `UnsupportedErc20ApprovalSpenderError` loses its `midnightBundles` field, and `PermitKind` / `MidnightTokenPermit` are removed (V2 takes no inline token permits). See `MIGRATION-v6-to-v7.md`.

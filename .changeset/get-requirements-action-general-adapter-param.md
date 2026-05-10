---
"@morpho-org/morpho-sdk": patch
---

Internal: `getRequirementsAction` now takes the transfer recipient as an
explicit `recipient` parameter instead of resolving it from `chainId`. The
function is `@internal` and not part of the public surface; all in-repo
callers (`marketV1` supply/repay paths, `vaultV1`/`vaultV2` deposit, and
`vaultV1` migrate-to-v2) have been updated to pass `recipient: generalAdapter1`
directly. No behavior change — same destination address, just no longer
hard-coded inside the helper.

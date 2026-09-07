---
"@morpho-org/morpho-sdk": patch
---

Preserve the canonical `getDaiPermitTypedData` and `DaiPermitArgs` exports under the raw Blue
`/blue/utils` and `/blue/types` facades. Maintained action flows continue to route DAI approvals
through Permit2 or a classic approval.

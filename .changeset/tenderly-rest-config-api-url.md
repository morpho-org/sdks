---
"@morpho-org/evm-simulation": major
---

`TenderlyRestConfig` now takes a single `apiUrl` (fully-qualified project-scoped URL) instead of separate `apiBaseUrl`, `accountSlug`, and `projectSlug` fields. Build the URL once at the call site: `https://api.tenderly.co/api/v1/account/<account>/project/<project>`.

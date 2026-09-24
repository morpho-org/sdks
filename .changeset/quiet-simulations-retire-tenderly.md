---
"@morpho-org/evm-simulation": major
---

Make `eth_simulateV1` the sole simulation backend. Remove `TenderlyRpcConfig`,
`ChainSimulationConfig.tenderlyRpc`, Tenderly execution and provider fallback;
require `simulateV1Url` for every configured chain. Use the full `timeoutMs`
budget (default 5000 ms) for one request without automatic retries. Preserve
logger support, existing error constructors and result fields, internal native
transfer reporting, and standalone-bundle retention checks. Optional asset
symbol/decimals metadata is omitted by the log-derived backend.

The one-time exception approved on 2026-09-24 permits these removals and the
legacy approval/signature authorization replacement planned in SDK-1293 without
a prior successor-introduction, deprecation annotation or published coexistence
minor. No other API removal inherits it. Authorization behavior is unchanged in
this backend cutover. See `docs/migrations/evm-simulation-v4-to-v5.md` and root
AGENTS.md §7 for the migration and exact scope.

Keep this change on the unreleased v5 integration branch until SDK-1297 completes
the stack; SDK-556 owns publication. The major bump, migration guide,
maintained-dependent/runtime/peer audit and required bumps, Cantina major audit
with its public report linked from the release CHANGELOG, and availability of
v4 remain required. No workspace runtime/peer dependents require bumps at the
SDK 6.0.0 baseline; re-audit before promotion.

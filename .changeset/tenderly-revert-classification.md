---
"@morpho-org/evm-simulation": patch
---

Tenderly reverts are never eligible for the `eth_simulateV1` fallback: a `status: false` result is accepted without the success-only `gasUsed` field, and a JSON-RPC error envelope with the execution-revert code (`3`) is mapped to `SimulationRevertedError` instead of `ExternalServiceError`. `parseTransfers` now lowercases log `topics` and `data` before signature dispatch and WETH9 pair matching, so mixed-case hex from a backend can no longer drop a transfer from the parsed output or the retention check.

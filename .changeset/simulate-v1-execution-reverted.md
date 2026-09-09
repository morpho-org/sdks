---
"@morpho-org/evm-simulation": patch
---

Map a node-level viem `ExecutionRevertedError` thrown by `eth_simulateV1` to `SimulationRevertedError` instead of `ExternalServiceError`, so a reverting bundle is never classified as a fallback-eligible service failure.

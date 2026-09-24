---
"@morpho-org/evm-simulation": major
---

Retire the Tenderly RPC backend. `eth_simulateV1` is now the sole simulation backend: there is no provider fallback and `timeoutMs` (default 5000) is the budget for the single `eth_simulateV1` request.

**Breaking:** `ChainSimulationConfig` now requires `simulateV1Url` for every configured chain and no longer accepts `tenderlyRpc`; the `TenderlyRpcConfig` type is removed. Migrate by replacing `tenderlyRpc: { rpcUrl }` entries with `simulateV1Url` pointing at a JSON-RPC node that supports `eth_simulateV1`. The unused `zod` runtime dependency is dropped.

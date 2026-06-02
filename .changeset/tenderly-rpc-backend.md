---
"@morpho-org/evm-simulation": major
---

Replace the Tenderly REST API backend with the Tenderly Node RPC
(`tenderly_simulateTransaction` and `tenderly_simulateBundle`).

- `TenderlyRestConfig` is removed; use `TenderlyRpcConfig` (`{ rpcUrl }`)
  embedded per-chain in `ChainSimulationConfig`. The chain-level type is now
  a discriminated union enforcing at least one of `tenderlyRpc` (primary) or
  `simulateV1Url` (fallback).
- `SimulationConfig.tenderlyRest` (and its `supportedChainIds`) is removed —
  Tenderly support is declared per chain.
- The `shareable` option on `simulate()` and the `tenderlyUrl` field on
  `SimulationResult` are removed; Tenderly Node RPC has no persistence /
  shareable-URL concept.

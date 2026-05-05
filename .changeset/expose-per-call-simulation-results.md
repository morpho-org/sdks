---
"@morpho-org/evm-simulation": minor
---

Expose per-call simulation results from `simulate()`.

Adds `SimulateOptions.includeCallResults`. When set, the result includes a
`callResults` array with one entry per simulated transaction (`data`,
`gasUsed`, `logs`), aligned with `simulationTxs`. This forces the
`eth_simulateV1` backend because Tenderly REST does not expose per-call
return data; combining `includeCallResults: true` with `shareable: true`
throws `SimulationValidationError`. Default behaviour is unchanged —
`callResults` is omitted unless explicitly requested.

New public types: `SimulationCallResult`, `SimulateOptions`.

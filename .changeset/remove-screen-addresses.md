---
"@morpho-org/evm-simulation": major
---

Remove the address screening surface. The `screenAddresses` function, the `AddressScreeningError` class, and the bundled static sanctioned-addresses list are no longer exported. Callers that need compliance screening should run it externally on the `simulationTxs` and `transfers` returned by `simulate()`.

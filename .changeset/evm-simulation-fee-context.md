---
"@morpho-org/evm-simulation": minor
---

Simulate under a realistic non-zero gas price (Cantina finding 1631). `SimulationTransaction` now accepts an optional fee — legacy `gasPrice`, or EIP-1559 `maxFeePerGas` / `maxPriorityFeePerGas` (mutually exclusive, validated) — forwarded through both the `eth_simulateV1` and Tenderly backends. When no fee is set, the bundle runs at a non-zero default (`DEFAULT_SIMULATION_GAS_PRICE`, 1 gwei, now exported) instead of `0`: a zero gas price never occurs on-chain, so a step that reverts only under a positive fee context — and is encoded `skipRevert: true` — previously succeeded in simulation while stranding earlier funds in `bundler3`, undetected by the retention guard. The guard now evaluates a possible execution. Pass the transaction's real effective gas price for an exact preview.

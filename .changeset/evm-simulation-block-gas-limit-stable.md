---
"@morpho-org/evm-simulation": minor
---

Add optional `ChainSimulationConfig.blockOverrides.gasLimit`, sent to `eth_simulateV1` as the simulated block's `blockOverrides.gasLimit`. Without it, requests are unchanged. Add optional `ChainSimulationConfig.parentHashCheck` to turn on or off the check that the simulated block's `parentHash` is the pinned block hash. It defaults to off on Stable (chain 988), whose nodes report a `parentHash` that never matches the pinned block, and on everywhere else. The block number, timestamp and reorg checks always apply.

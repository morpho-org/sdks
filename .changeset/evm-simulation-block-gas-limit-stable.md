---
"@morpho-org/evm-simulation": minor
---

Add optional `ChainSimulationConfig.blockOverrides.gasLimit`, sent to `eth_simulateV1` as the simulated block's `blockOverrides.gasLimit`. Without it, requests are unchanged. Skip the simulated block `parentHash` check on Stable (chain 988), whose nodes report a `parentHash` that never matches the pinned block; the block number, timestamp and reorg checks still apply there.

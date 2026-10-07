---
"@morpho-org/evm-simulation": minor
---

Add an optional `validation` flag to `ChainSimulationConfig` (default `false`) that sets the `validation` parameter sent with `eth_simulateV1` for that chain. Monad nodes reject `validation: false` ("not supported yet"), so every Monad simulation failed under 5.0.0. Set `validation: true` for Monad (chain 143): its simulated block has base fee 0 and fees default to 0, so gas is still not charged and native balance movements stay free of gas. On Monad, `gasUsed` reports the call's gas limit rather than the gas consumed.

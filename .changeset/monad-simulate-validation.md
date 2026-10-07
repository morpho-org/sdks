---
"@morpho-org/evm-simulation": patch
---

Fix Monad (chain 143) simulations, which all failed under 5.0.0. Monad nodes reject `eth_simulateV1` with `validation: false` ("not supported yet"), so Monad now sends `validation: true`; its simulated block has base fee 0, so gas is still not charged and native balance movements stay free of gas. Monad's `latest` block is not final: simulating at its number runs on another parent, which failed the pinned-block check, so Monad now pins to `finalized` when no `blockNumber` is given. On Monad, `gasUsed` reports the call's gas limit rather than the gas consumed.

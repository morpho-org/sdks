---
"@morpho-org/evm-simulation": patch
---

Document the gas-cost and sender-balance fidelity limit of `simulate()` and its bundler-retention guard (Cantina finding 1631). Simulation overrides the sender's native balance to `maxUint256 / 2` and models no gas price, so a step that reverts on-chain only because of the caller's real post-gas native balance still succeeds in simulation; if that step is `skipRevert: true`, `BlacklistViolationError` does not fire even though earlier funds are stranded on-chain. JSDoc, README, and package conventions now state the invariant integrators must uphold — keep native/value-carrying steps `skipRevert: false`. No behavior change.

---
"@morpho-org/evm-simulation": patch
---

fix(evm-simulation): detect native ETH retained by bundler3 on the Tenderly backend

`assertNoBundlerRetention` only inspected parsed `Transfer` logs, so native ETH
retained by a bundler3 address slipped through the guard on the Tenderly primary
backend — native ETH emits no event log, and Tenderly derives it into
`assetChanges` rather than synthetic transfer logs (Cantina finding 1440).

The retention check now also reads native ETH from `assetChanges` (the
cross-backend source of truth), while ERC20/WETH retention keeps coming from
transfer logs. Native transfer logs (the `eth_simulateV1` synthetic sentinel)
are only used as a fallback for bundler addresses absent from `assetChanges`, so
native moves are never double-counted on `eth_simulateV1`.

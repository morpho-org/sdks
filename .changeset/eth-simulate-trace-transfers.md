---
"@morpho-org/evm-simulation": minor
---

Enable `traceTransfers` on the `eth_simulateV1` backend so native-ETH moves — including ETH moved through internal calls (e.g. a `WETH.withdraw` refund) — are captured in `assetChanges`. The node synthesizes native transfers as `Transfer` logs from the native sentinel, which `parseTransfers` normalizes to viem's `ethAddress`. Native ETH is now derived entirely from these logs instead of the top-level transaction `value`, closing the prior coverage gap where the `eth_simulateV1` path missed internally-moved ETH (Tenderly already reported it). Both backends now report the full net native-ETH delta.

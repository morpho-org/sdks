---
"@morpho-org/evm-simulation": major
---

Harmonize `assetChanges` across both simulation backends into a single canonical
shape, exposed as `SimulationResult.assetChanges`.

- New exported `AssetChange` type: `{ token, symbol?, decimals?, diff }`, the
  sender's net per-asset balance change over the whole bundle (native ETH uses
  viem's `ethAddress` sentinel as `token`).
- `eth_simulateV1` now requests viem's `traceAssetChanges` (account-scoped) and
  normalizes the per-token aggregate to `AssetChange[]`; previously `assetChanges`
  was Tenderly-only and lost on the fallback path. This requires the fallback RPC
  to support `eth_createAccessList` and multi-block `eth_simulateV1`.
- Tenderly's per-transfer `assetChanges` payload is now schema-validated and
  reduced to the same `AssetChange[]` (net per token for the sender).

**Breaking:** the opaque per-call `SimulationCall.assetChanges?: unknown` field is
removed. Read the normalized bundle-level `SimulationResult.assetChanges` instead.

---
"@morpho-org/evm-simulation": major
---

Harmonize `assetChanges` across both simulation backends into a single canonical
shape, exposed as `SimulationResult.assetChanges`.

- New exported `AssetChange` type: `{ token, symbol?, decimals?, diff }`, the
  sender's net per-asset balance change over the whole bundle (native ETH uses
  viem's `ethAddress` sentinel as `token`).
- `eth_simulateV1` now derives `assetChanges` from the emitted transfer logs
  (sender's net per-token delta) plus the sender's net native-ETH outflow from
  the top-level `value` of each transaction (reported under `ethAddress`),
  matching the Tenderly shape; previously `assetChanges` was Tenderly-only and
  lost on the fallback path. Native ETH the sender *receives* through internal
  calls (e.g. a `WETH.withdraw` refund) emits no log and is not captured on the
  fallback path — use Tenderly for full native-ETH accounting.
- Tenderly's per-transfer `assetChanges` payload is now schema-validated and
  reduced to the same `AssetChange[]` (net per token for the sender).
- `assetChanges` is now sorted by token address on both backends for
  deterministic, cross-backend output.

**Breaking:** the opaque per-call `SimulationCall.assetChanges?: unknown` field is
removed. Read the normalized bundle-level `SimulationResult.assetChanges` instead.

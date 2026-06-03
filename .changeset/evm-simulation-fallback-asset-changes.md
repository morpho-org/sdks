---
"@morpho-org/evm-simulation": minor
---

Populate `assetChanges` on the `eth_simulateV1` fallback path. The fallback now
requests viem's native `traceAssetChanges` (scoped to the sender account) and
attaches the resulting bundle-level aggregate (`{ token, value: { pre, post,
diff } }[]`, native ETH included) to the last call — previously `assetChanges`
was Tenderly-only and absent whenever the simulation fell back to
`eth_simulateV1`. Unlike Tenderly's per-tx blob, viem reports a single
sender-scoped, bundle-level aggregate; the payload remains opaque (`unknown`).
This requires the fallback RPC to support `eth_createAccessList` and multi-block
`eth_simulateV1`.

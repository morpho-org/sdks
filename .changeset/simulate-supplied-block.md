---
"@morpho-org/evm-simulation": minor
---

`simulate()` no longer calls `eth_chainId` before simulating or re-fetches the state block after `eth_simulateV1` to check for a reorg. The new optional `block` parameter (`{ number, hash, timestamp }`, exported as `StateBlock`) skips the block lookup, so a simulation without quoted-asset metadata reads sends only `eth_simulateV1`. `block` cannot be combined with `blockNumber`. Every call inside `eth_simulateV1` now carries the request's `chainId`, so nodes that check it reject an endpoint on another chain without an extra RPC request; that rejection throws `InvalidSimulationResponseError`, as the `eth_chainId` mismatch did.

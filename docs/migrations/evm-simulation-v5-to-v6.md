# EVM simulation v5 → v6

## Pass a client instead of a config

`simulate()` now takes the caller's viem client. `SimulationConfig`,
`ChainSimulationConfig` and `SimulateParams.chainId` are removed: the chain
comes from `client.chain.id`, and the client's transport owns the endpoint,
its timeout and its retries.

```ts
// v5
const config: SimulationConfig = {
  chains: new Map([[1, { simulateV1Url }]]),
  timeoutMs: 5000,
};
const result = await simulate(config, { chainId: 1, transactions });

// v6
const client = createPublicClient({
  chain: mainnet,
  transport: http(simulateV1Url),
});
const result = await simulate(client, { timeoutMs: 5000, transactions });
```

`logger`, `timeoutMs`, `blockOverrides.gasLimit` and `parentHashCheck` moved
from the chain config onto `SimulateParams`. Callers simulating several
chains pass the client for each chain — there is no longer a shared config map.

## Error mapping

A node that rejects the request `chainId` (endpoint on another chain) now
throws `InvalidChainIdError`, a new non-bypassable error, instead of
`InvalidSimulationResponseError`. Failures before `eth_simulateV1` — the
block lookup or quoted-asset metadata reads — still surface as the bypassable
`ExternalServiceError`, and on a wrong-chain endpoint can fail first with a
generic node error; `InvalidChainIdError` is not guaranteed for every
wrong-chain configuration.

# EVM simulation v5 → v6

> [!WARNING]
> v6 is a breaking release **with no deprecation period**: the v5
> config API is removed outright, so upgrade and switch in one step.

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

`timeoutMs` also changed meaning. In v5 it aborted the whole call, including
an in-flight `eth_simulateV1` request. In v6 the caller's client owns the
transport, so `timeoutMs` only bounds the steps `simulate()` drives between
requests — an in-flight request follows the transport's own timeout and retry
policy (viem's `http()` defaults: 10 s timeout, 3 retries). To keep a similar
cap, set it on the transport:

```ts
const client = createPublicClient({
  chain: mainnet,
  transport: http(simulateV1Url, { timeout: 5000, retryCount: 0 }),
});
```

## Removed checks and the `block` input

v6 drops the `eth_chainId` lookup and the post-simulation re-fetch that
reported a reorged pinned block as `InvalidSimulationResponseError`; a
mid-flight reorg is no longer detected or reported.

The new optional `block` parameter (`{ number, hash, timestamp }`, exported as
`StateBlock`) supplies the state block directly and skips the block lookup,
so a simulation without quoted-asset metadata reads sends only
`eth_simulateV1`. `block` cannot be combined with `blockNumber`.

## Error mapping

A node that rejects the request `chainId` (endpoint on another chain) now
throws `InvalidChainIdError`, a new non-bypassable error, instead of
`InvalidSimulationResponseError`. Failures before `eth_simulateV1` — the
block lookup or quoted-asset metadata reads — still surface as the bypassable
`ExternalServiceError`, and on a wrong-chain endpoint can fail first with a
generic node error; `InvalidChainIdError` is not guaranteed for every
wrong-chain configuration.

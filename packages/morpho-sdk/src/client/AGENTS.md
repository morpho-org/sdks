# `client/`

Entry point of the SDK. `MorphoClient` holds a `MorphoConfig` (per-chain transports + options) and exposes entity factories. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Config

```ts
new MorphoClient({
  transports: { 1: http(), 8453: http() },
  supportSignature: true,
  supportDeployless: true,
  metadata: ...,
});
```

- `transports` is the only required field. Keys are chain ids; values are viem `Transport`s.
- The SDK never accepts a viem `Client` from the integrator — it builds one internally per entity via `getViemClient(chainId)`.

## `getViemClient(chainId)`

Public helper. Resolves `config.transports[chainId]` and returns `createClient({ transport })` (chain left `undefined` on the client; SDK identifies chain via `chainId` carried by entities). Throws `UnsupportedChainError` for unconfigured chains. Each call creates a fresh client — no cache, no warm-up.

## Responsibilities

- Holds the resolved config (`readonly`).
- Builds viem clients on demand for the requested chain id.
- Acts as a factory for entities:
  - `client.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.marketV1(marketParams, chainId) → MorphoMarketV1`
- Never holds state beyond configuration. Never calls actions directly.

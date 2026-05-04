# `client/`

Entry point of the SDK. `MorphoClient` wraps a viem `Client` and exposes vault/market accessors. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Holds SDK options: `supportSignature`, `supportDeployless`, `metadata`. All `readonly`.
- Acts as a factory for entities:
  - `client.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.marketV1(marketParams, chainId) → MorphoMarketV1`
- Never holds state beyond configuration. Never calls actions directly. No cache, no `init()`, no warm-up — those would couple the SDK to a particular host runtime and break statelessness.

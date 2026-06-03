# `client/`

Entry point of the SDK. `morphoViemExtension()` returns a viem `extend(...)` function that adds a stateless `morpho` namespace to a viem `Client`, exposing vault/market accessors under `client.morpho`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Holds SDK options: `supportSignature`, `supportDeployless`, `metadata`. All `readonly`.
- Acts as a factory for entities:
  - `client.morpho.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.morpho.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.morpho.marketV1(marketParams, chainId) → MorphoMarketV1`
- Rides on top of a viem client the integrator already owns (public or wallet), so reads and writes share one transport / chain / account.
- Never holds state beyond configuration. Never calls actions directly. No cache, no `init()`, no warm-up — those would couple the SDK to a particular host runtime and break statelessness.

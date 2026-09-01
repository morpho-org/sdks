# `client/`

Entry point of the SDK. `morphoViemExtension()` returns a viem `extend(...)` function that adds a stateless `morpho` namespace to a viem `Client`, exposing vault/market accessors under `client.morpho`. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Holds SDK options: `supportSignature`, `supportDeployless`, `metadata`. All `readonly`.
- Acts as a factory for entities:
  - `client.morpho.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.morpho.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.morpho.blue(marketParams, chainId) → MorphoBlue`
  - `client.morpho.midnight(chainId) → MorphoMidnight`
- Keeps Blue reads and the BlueBundlesV1-backed writes on the existing
  `client.morpho.blue(...)` entity. Never expose a parallel `blueBundlesV1` factory or a route
  switch.
- Rides on top of a viem client the integrator already owns (public or wallet), so reads and writes share one transport / chain / account.
- Never holds state beyond configuration. Never calls actions directly. No cache, no `init()`, no warm-up — those would couple the SDK to a particular host runtime and break statelessness.

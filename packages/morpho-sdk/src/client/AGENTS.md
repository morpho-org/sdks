# `client/`

Entry point of the SDK. `MorphoClient` wraps a viem `Client` and exposes vault/market accessors. Inherits the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Responsibilities

- Holds SDK options: `supportSignature`, `supportDeployless`, `metadata`. All `readonly`.
- Acts as a factory for entities:
  - `client.vaultV1(address, chainId) → MorphoVaultV1`
  - `client.vaultV2(address, chainId) → MorphoVaultV2`
  - `client.marketV1(marketParams, chainId) → MorphoMarketV1`
- Never holds state beyond configuration. Never calls actions directly. No cache, no `init()`, no warm-up — those would couple the SDK to a particular host runtime and break statelessness.

## Extending the client

`client.extend((c) => ({ name: factory }))` returns a **new** `MorphoClient` carrying integrator-supplied entity factories alongside the built-ins. Statelessness is preserved (the original client is untouched) and types accumulate (`this & TExtension`).

- **Reserved names** (`viemClient`, `options`, `_options`, `vaultV1`, `vaultV2`, `marketV1`, `extend`) and previously registered extension names cannot be reused — collisions throw `ExtensionNameCollisionError`.
- **Validation is two-staged**: at registration (shape, identifier `^[a-z][a-zA-Z0-9]*$`, value-must-be-function) and lazily at call time (entity returns object of methods, each method returns `{ buildTx, getRequirements? }`, `buildTx()` returns a `Transaction`-shaped object, `getRequirements()` resolves to `Transaction`/`Requirement` items).
- **The integrator keeps `deepFreeze` and `metadata` ownership.** Validators do not refreeze and do not auto-inject `client.options.metadata`. Use the `defineEntity` identity helper when defining factories outside the inline `.extend()` call to get TS errors at the definition site.

See [`TIB-2026-05-05-morpho-client-extend`](../../../../docs/tibs/TIB-2026-05-05-morpho-client-extend.md) for the design.

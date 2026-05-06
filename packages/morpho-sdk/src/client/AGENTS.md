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

`client.extend({ name: EntityClass })` returns a **new** `MorphoClient` carrying integrator-supplied entity classes alongside the built-ins. Each registered class must extend the `MorphoEntity` base (which exposes `protected readonly client: MorphoClientType` for subclasses, exactly like `MorphoVaultV1` / `MorphoMarketV1` do). The constructor signature `(client, ...args)` becomes the call shape `client.<name>(...args)`. Statelessness is preserved (the original client is untouched) and types accumulate (`this & ExtensionInstances<TExt>`).

- **Reserved names are derived dynamically.** The validator checks `name in client`, so any field/method declared on `MorphoClient` (built-in `viemClient` / `options` / `vaultV1` / `vaultV2` / `marketV1` / `extend`, plus everything inherited from `Object.prototype` like `constructor` / `toString` / `valueOf`, plus previously registered extensions) is rejected without a hardcoded list. The `then` thenable trap is reserved separately because it is not on any standard prototype. Collisions throw `ExtensionNameCollisionError`. Names matching `_…` / non-`[a-z][a-zA-Z0-9]*` are caught earlier by `InvalidExtensionNameError`.
- **Validation is two-staged**: at registration (shape, identifier `^[a-z][a-zA-Z0-9]*$`, value must be a class extending `MorphoEntity`) and lazily at call time. Calls are wrapped via a Proxy: any method returning `{ buildTx, getRequirements? }` has its `Transaction`/`Requirement` payloads structurally validated; methods returning anything else (fetchers, getters) pass through unchanged. Async action methods (returning a thenable) are rejected with `InvalidActionShapeError` — actions are sync per root §1. `instanceof` against the integrator's class is preserved.
- **The integrator keeps `deepFreeze` and `metadata` ownership.** Validators do not refreeze and do not auto-inject `client.options.metadata` — read it inside `buildTx` via `this.client.options.metadata` if you want to thread it through.

See [`TIB-2026-05-05-morpho-client-extend`](../../../../docs/tibs/TIB-2026-05-05-morpho-client-extend.md) for the design.

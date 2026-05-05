# TIB-2026-05-05: `MorphoClient.extend()` for integrator entity classes

| Field      | Value                |
| ---------- | -------------------- |
| **Status** | Proposed             |
| **Date**   | 2026-05-05           |
| **Author** | @Foulks-Plb          |
| **Scope**  | Package: `morpho-sdk`|

---

## Context

`MorphoClient` exposes three hardcoded entity factories — `vaultV1`, `vaultV2`, `marketV1` —
defined as class methods at `packages/morpho-sdk/src/client/morphoClient.ts`. Each returns a
class instance (`MorphoVaultV1`, `MorphoVaultV2`, `MorphoMarketV1`) bound to the client via a
`private readonly client: MorphoClientType` field.

Integrators who build adjacent protocols on top of Morpho (vault wrappers, leverage strategies,
custom routers, periphery contracts) currently have two options to wire their own transaction
builders into the same `MorphoClient` flow:

1. Subclass `MorphoClient`. Couples the integrator to our class hierarchy and breaks `instanceof`
   checks against vendored versions.
2. Maintain a parallel client beside ours, duplicating viem-client wiring, chain checks, and
   options plumbing. Fragments the call site (`morpho.vaultV1(...)` vs `myProto.foo(...)`).

Neither is acceptable for a stateless, composable SDK. viem solved a similar shape with
`client.extend(actions)`, which returns a new client carrying the integrator's methods on top of
the original surface.

This TIB introduces an analogous mechanism on `MorphoClient`, but **keyed on entity classes**
rather than action callbacks — so the integrator's surface is shaped exactly like ours
(`client.<name>(args)` returns an entity instance whose methods build actions).

## Goals / Non-Goals

**Goals**

- Let an integrator register custom **entity classes** onto `MorphoClient` via a viem-style
  `.extend(map)` hook, with full TypeScript inference (`this & ExtensionInstances<TExt>`).
- Provide a `MorphoEntity` base class every registered class must extend. The base holds the
  `protected readonly client: MorphoClientType` binding so subclasses access SDK-wide
  configuration (`viemClient`, `options`, `options.metadata`, …) the same way the built-in
  entities do.
- Validate every extension structurally — both at registration (collision, identifier shape,
  value must be a class extending `MorphoEntity`) and at call time (any method returning
  `{ buildTx, getRequirements? }` is shape-checked; `buildTx()` must return a `Transaction`
  shape and `getRequirements()` must resolve to `Transaction | Requirement` items) — so misuse
  fails loud, not silent.
- Preserve `MorphoClient`'s statelessness: `.extend()` returns a **new** instance, never mutates
  the original.
- Keep `deepFreeze` and `metadata` injection in the integrator's hands. Validators do not
  refreeze and do not auto-inject `client.options.metadata` into integrator-built transactions.
- Ship as a SemVer **minor** bump: every existing call site keeps compiling.

**Non-Goals**

- Flat method extension à la viem `walletClient.extend(walletActions)` (where added members are
  not namespaced). Out of scope: it would defeat the entity-per-namespace convention codified in
  `client/CLAUDE.md` and the layering rules in root `AGENTS.md` §1.
- Dynamic unregistration (`client.unextend(name)`) or override of an existing extension. Out of
  scope: would re-introduce mutability and complicate type accumulation. Re-construct the client
  if an extension needs replacing.
- Wiring the extended client through `morphoViemExtension` in this TIB. Integrators using the
  viem-extension entry point still get the bare `MorphoClient` namespace today; chaining into
  `.extend()` from there is a follow-up.
- Backfilling JSDoc beyond the new surface. The `morpho-sdk` JSDoc burndown is tracked in
  [`TIB-2026-05-04`](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md).

## Current Solution

`MorphoClient` is a plain class with `viemClient`, `options`, and three factory methods that
instantiate the built-in entity classes. There is no extension hook. Integrators wanting to graft
their own `buildTx` flows replicate the SDK's chain-id / address validation in their own classes
or subclass `MorphoClient` directly.

## Proposed Solution

### Surface

A new `MorphoEntity` abstract base class:

```ts
export abstract class MorphoEntity {
  constructor(protected readonly client: MorphoClientType) {}
}
```

A new `extend` method on `MorphoClient`:

```ts
extend<const TExtension extends ExtensionMap>(
  extensions: TExtension,
): this & ExtensionInstances<TExtension>
```

Where:

- `ExtensionMap = Readonly<Record<string, EntityConstructor>>`
- `EntityConstructor<TArgs, TInstance> = new (client: MorphoClientType, ...args: TArgs) => TInstance & MorphoEntity`
- `ExtensionInstances<TExt>` resolves each constructor entry to its call signature minus the
  leading `client` parameter — i.e. `client.<name>` becomes `(...args: TArgs) => TInstance`.

The `any[]` in those constructor signatures is the standard variadic-generic pattern (TypeScript
cannot otherwise accept arbitrarily-typed integrator constructors) and is annotated with
`biome-ignore` per repo convention.

### Mechanism

`.extend()`:

1. Calls `validateExtensionMap(extensions, [...RESERVED, ...alreadyRegistered])` — throws
   `InvalidExtensionShapeError` / `InvalidExtensionNameError` / `ExtensionNameCollisionError` /
   `InvalidEntityClassError` on collision or malformed input. The latter rejects values that
   are not classes or do not extend `MorphoEntity`.
2. Builds a merged `ReadonlyMap<string, EntityConstructor>` from `this._extensions` and the new
   entries.
3. Constructs and returns a **new** `MorphoClient` carrying that map. The cast to
   `this & ExtensionInstances<TExtension>` is a single `as` (no `as unknown as`).

The `MorphoClient` constructor reads the map and surfaces each extension as a non-writable,
non-configurable own property whose value is a factory:

```ts
const factory = (...args) => wrapEntityInstance(name, new EntityClass(this, ...args));
```

`wrapEntityInstance` returns a `Proxy` over the entity instance whose `get` trap intercepts every
method access. When the integrator calls a method:

- If the return value looks like an action (`{ buildTx: function }`), the wrapper validates
  `buildTx()` and (if present) `getRequirements()` payloads structurally against the
  `Transaction` / `Requirement` contracts.
- Otherwise (fetchers, computed values, plain getters), the return is passed through unchanged.

The Proxy preserves `instanceof` against the integrator's class and against `MorphoEntity`.
Validation is non-destructive: the integrator's freeze and metadata choices on the returned
`Transaction` are preserved.

### DevEx sketch

```ts
import { MorphoClient, MorphoEntity, type MorphoClientType } from "@morpho-org/morpho-sdk";
import type { Address } from "viem";

class MyLending extends MorphoEntity {
  constructor(
    client: MorphoClientType,
    public readonly vault: Address,
    public readonly chainId: number,
  ) {
    super(client);
  }

  deposit({ amount, user }: { amount: bigint; user: Address }) {
    if (this.client.viemClient.chain?.id !== this.chainId) throw new ChainIdMismatchError(...);
    return {
      buildTx: () => ({
        to: this.vault,
        value: 0n,
        data: encodeMyDeposit({ vault: this.vault, amount, user }),
        action: { type: "myLendingDeposit", args: { amount, user } },
      }),
      getRequirements: async () => [
        await fetchApproval(this.client.viemClient, this.vault, amount, user),
      ],
    };
  }

  // Non-action methods (fetchers) are passed through unchanged.
  async getData() {
    return fetchMyVault(this.vault, this.client.viemClient);
  }
}

const client = new MorphoClient(viemClient, { supportSignature: true })
  .extend({ myLending: MyLending });

const entity = client.myLending(vault, 1);            // typed as MyLending
const action = entity.deposit({ amount: 1n, user });   // typed as { buildTx, getRequirements }
const tx = action.buildTx();                           // validated structurally
```

### New surface (all in `packages/morpho-sdk`)

- `types/morphoEntity.ts`: `MorphoEntity` abstract base class.
- `types/extension.ts`: `ExtensionAction`, `EntityConstructor`, `ExtensionMap`,
  `ExtensionInstances`.
- `types/error.ts`: `ExtensionNameCollisionError`, `InvalidExtensionNameError`,
  `InvalidExtensionShapeError`, `InvalidEntityClassError`, `InvalidActionShapeError`,
  `InvalidTransactionShapeError`, `InvalidRequirementShapeError`.
- `helpers/validateExtension.ts`: `RESERVED_MORPHO_CLIENT_NAMES`, `validateExtensionMap`,
  `wrapEntityInstance`. Internal but co-tested.
- `client/morphoClient.ts`: `extend` method, internal third constructor arg holding the
  `ReadonlyMap<string, EntityConstructor>`.
- `types/client.ts`: `MorphoClientType.extend` declaration.

### Implementation Phases

- **Phase 1 — Types, base class, errors, validators (this PR):** add `MorphoEntity`, the
  extension types, the seven typed errors, the `validateExtension` helpers and their colocated
  unit tests. No client changes yet.
- **Phase 2 — `MorphoClient.extend()` (this PR):** wire the method, the internal extensions map,
  and the constructor's auto-surfacing of factories. Update `MorphoClientType`. Colocated unit
  tests cover the happy path, chained extends, the original-not-mutated invariant, the freeze
  and metadata invariants, the `instanceof` guarantee, the non-action pass-through, and every
  error path.
- **Phase 3 — Follow-ups (separate PRs):** integrate with `morphoViemExtension` so a viem-built
  `client.morpho` chain can call `.extend()` directly; consider re-exporting `deepFreeze` /
  `addTransactionMetadata` for integrator convenience if usage demand surfaces.

## Considered Alternatives

### Alternative 1: Subclassing `MorphoClient`

Integrators extend the class and add their own methods.

**Why rejected:** Couples integrators to our prototype chain, breaks `instanceof` against vendored
or pinned SDK versions, prevents accumulating multiple unrelated extensions (single inheritance),
and offers no validation surface — typos in method names are silent until call time.

### Alternative 2: Callback-based `extend((c) => ({ name: factoryFn }))` with plain object factories

`extend` takes a callback returning a record of factory functions; each factory returns a plain
object whose methods build actions.

**Why rejected:** This was the first iteration of this TIB. The factory-function shape diverges
from the existing `MorphoVaultV1` / `MorphoMarketV1` / `MorphoEntity` pattern: integrators end up
with two mental models (classes for built-ins, callbacks for extensions). The class-based shape
lets the integrator reuse `this`, `instanceof`, and the standard `super(client)` boilerplate
they already understand, and matches root `AGENTS.md` §1 ("entities are classes that read state
and validate").

### Alternative 3: Flat method extension (viem `walletClient.extend(walletActions)` style)

`extend` adds methods directly to the client root rather than namespaced entity factories.

**Why rejected:** The SDK's surface is organised by **entity** (`vaultV1`, `marketV1`, etc.), and
`client/CLAUDE.md` explicitly defines the client as a factory for entities. A flat extend would
mix integrator action methods with our entity factories, blurring the contract and making
collision detection harder. The namespaced approach also matches the AI-legibility rule in root
`AGENTS.md` §6: an agent reading `client.myLending.deposit(...)` immediately sees the boundary
between the SDK's surface and the integrator's.

### Alternative 4: Mutate `this` instead of returning a new client

`extend` would attach the new properties to the same instance and return it.

**Why rejected:** Violates the statelessness / immutability rule in `client/CLAUDE.md` ("Never
holds state beyond configuration"), and would surprise integrators who hold a reference to the
pre-extension client. Cloning is cheap because the client itself stores no runtime state.

### Alternative 5: No base class — integrators implement a structural interface

Drop `MorphoEntity` and check structurally that the registered class has the right shape.

**Why rejected:** A structural interface cannot enforce that the constructor accepts `client` as
its first argument, so integrators would forget to wire it and the SDK couldn't validate. The
abstract base class makes the contract explicit, gives integrators a place to hang shared helpers
in the future, and matches the existing built-in entity pattern exactly.

## Assumptions & Constraints

- TypeScript variadic-generic inference via `this & ExtensionInstances<TExt>` accumulates types
  correctly across successive `.extend()` calls. Verified by colocated unit tests on
  `MorphoClient.extend()`.
- Integrators accept that runtime validation is structural, not type-driven: an action returning a
  `Transaction` whose `action.type` is unknown to the SDK is allowed. The SDK only validates
  shape, not semantics.
- The `useMaxParams: 2` Biome rule is respected by passing `{ entityName, methodName }` as a
  single options object to internal validator helpers. The Proxy `get` trap, whose three-arg
  signature is fixed by the JS spec, carries a single `biome-ignore`.

## Dependencies

- No new runtime dependencies. The implementation uses only existing SDK types
  (`Transaction`, `Requirement`, `BaseAction`, `MorphoClientType`) and standard JS primitives
  (`Proxy`, `Reflect.get`, `Object.defineProperty`).

## Security

- **Name collision is a hard error**, not a silent override. An integrator cannot shadow
  `vaultV1`, `marketV1`, `viemClient`, `options`, or `extend` themselves. Reserved names are
  centralised in `RESERVED_MORPHO_CLIENT_NAMES` and the list is the single source of truth.
- **Identifier whitelist**: extension names must match `/^[a-z][a-zA-Z0-9]*$/`. Rejects accidental
  prototype-pollution-style keys (`__proto__`, `constructor`, `_internal`).
- **Inheritance check**: every registered class must extend `MorphoEntity`. Prevents arbitrary
  POJO-like values from being registered and enforces the `client`-binding contract at the
  language level.
- **Surfaced as non-writable / non-configurable own properties** via `Object.defineProperty`,
  preventing post-registration overwrite.
- **Validation is strict on the SDK's invariants** but **does not impose `deepFreeze`**: integrators
  remain responsible for freezing their own returned `Transaction` objects if they want
  the same immutability the built-in actions guarantee. This is a deliberate trade-off — the SDK
  does not own the integrator's transaction shape.
- **Metadata is not auto-injected** into integrator-built transactions. Built-in entities still
  apply `addTransactionMetadata` per the existing rules; integrators opt-in by reading
  `this.client.options.metadata` and calling the helper themselves.

## Future Considerations

- Re-export `deepFreeze` (from `@morpho-org/morpho-ts`) and `addTransactionMetadata` from the
  package barrel if integrator usage shows repeated re-imports.
- Add a viem-extension overload (`morphoViemExtension({ extend })`) so integrators using the
  viem-attached entry point can pre-register extensions in one call.
- A `client.extensions` introspection getter (read-only `string[]`) for tooling that wants to
  enumerate registered names. Not shipped now to keep the surface minimal.
- Consider whether `MorphoEntity` should expose protected getters (`viemClient`, `options`) to
  shorten `this.client.viemClient` to `this.viemClient`. Held off for now to keep the inheritance
  contract minimal and consistent with the existing built-in entities, which use
  `this.client.viemClient`.

## Open Questions

- Should `getRequirements()` validation enumerate the SDK's known `Requirement` action types and
  warn on unknown ones, or stay purely structural? Current proposal: stay structural — integrators
  may invent their own `Requirement` shapes on top of integrator-defined permit-like flows.

## References

- Root [`AGENTS.md`](../../AGENTS.md) §1 (Layering / Modularity / Testability), §2 (Forbidden
  patterns), §3 (Type discipline), §5 (Testing), §7 (Releases & versioning).
- [`packages/morpho-sdk/src/client/CLAUDE.md`](../../packages/morpho-sdk/src/client/CLAUDE.md) —
  client responsibilities and statelessness invariant.
- [`packages/morpho-sdk/src/entities/CLAUDE.md`](../../packages/morpho-sdk/src/entities/CLAUDE.md)
  — entity layer conventions the integrator's class should mirror.
- [`TIB-2026-05-04`](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md) — JSDoc rollout
  baseline applied to the new surface.
- viem `Client.extend` reference pattern (cf. `viem/clients/createClient.ts`).

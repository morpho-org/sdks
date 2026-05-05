# TIB-2026-05-05: `MorphoClient.extend()` for integrator entities and actions

| Field      | Value                |
| ---------- | -------------------- |
| **Status** | Proposed             |
| **Date**   | 2026-05-05           |
| **Author** | @Foulks-Plb          |
| **Scope**  | Package: `morpho-sdk`|

---

## Context

`MorphoClient` exposes three hardcoded entity factories — `vaultV1`, `vaultV2`, `marketV1` — defined as
class methods at `packages/morpho-sdk/src/client/morphoClient.ts`. Integrators who build adjacent
protocols on top of Morpho (vault wrappers, leverage strategies, custom routers, periphery
contracts) currently have two options to wire their own transaction builders into the same
`MorphoClient` flow:

1. Subclass `MorphoClient`. Couples the integrator to our class hierarchy and breaks `instanceof`
   checks against vendored versions.
2. Maintain a parallel client beside ours, duplicating viem-client wiring, chain checks, and
   options plumbing. Fragments the call site (`morpho.vaultV1(...)` vs `myProto.foo(...)`).

Neither is acceptable for a stateless, composable SDK. viem solved the same shape with
`client.extend(actions)`, which returns a new client carrying the integrator's methods on top of
the original surface.

This TIB introduces an analogous mechanism on `MorphoClient`, scoped to the SDK's entity model
(factories returning `{ buildTx, getRequirements }`).

## Goals / Non-Goals

**Goals**

- Let an integrator attach custom **entity factories** to `MorphoClient` via a viem-style
  `.extend()` hook, with full TypeScript inference (`this & TExtension`).
- Validate every extension structurally — both at registration (collision, identifier shape, value
  is a function) and at call time (entity returns object of action methods, action returns
  `{ buildTx, getRequirements? }`, `buildTx()` returns a `Transaction`-shaped object,
  `getRequirements()` resolves to `Transaction | Requirement` items) — so misuse fails loud, not
  silent.
- Preserve `MorphoClient`'s statelessness: `.extend()` returns a **new** instance, never mutates
  the original.
- Keep `deepFreeze` and `metadata` injection in the integrator's hands. Validators do not refreeze
  and do not auto-inject metadata into integrator transactions.
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

`MorphoClient` is a plain class with `viemClient`, `options`, and three factory methods. There is
no extension hook. Integrators wanting to graft their own `buildTx` flows replicate the SDK's
chain-id / address validation in their own classes.

## Proposed Solution

Add an `extend` method on `MorphoClient`:

```ts
extend<const TExtension extends ExtensionMap>(
  extension: (client: this) => TExtension,
): this & TExtension
```

`ExtensionMap` is `Readonly<Record<string, ExtensionEntityFactory>>` where
`ExtensionEntityFactory = (...args: any[]) => ExtensionEntity`, and `ExtensionEntity` is a record
of action factories returning `{ buildTx, getRequirements? }`. The `any[]` in those signatures is
the standard variadic-generic constraint pattern and is annotated with `biome-ignore` per repo
convention.

The integrator passes a callback receiving the current client and returning a record of entity
factories. `.extend()`:

1. Calls the callback to obtain the raw map.
2. Runs `validateExtensionMap(raw, [...RESERVED, ...alreadyRegistered])` — throws
   `InvalidExtensionShapeError` / `InvalidExtensionNameError` / `ExtensionNameCollisionError` on
   collision or malformed input.
3. Wraps each factory with `wrapExtensionFactory(name, factory)`. The wrapper validates entity,
   action, transaction, and requirement shapes lazily on each call. It does not freeze, copy, or
   transform the integrator's outputs.
4. Builds and returns a **new** `MorphoClient` instance carrying both the previously registered
   extensions and the new ones via a private `ReadonlyMap<string, ExtensionEntityFactory>`. The
   constructor reads that map and surfaces each entry as a non-writable, non-configurable own
   property via `Object.defineProperty`. The cast to `this & TExtension` is a single `as`
   (no `as unknown as`).

A `defineEntity` identity helper is exported for integrators who define entity factories in a
standalone variable / file and want shape errors to surface at the definition site rather than at
the `.extend()` call site. Inline definitions don't need it — the `.extend()` constraint already
provides full contextual typing.

### DevEx sketch

```ts
import { defineEntity, MorphoClient } from "@morpho-org/morpho-sdk";

const client = new MorphoClient(viemClient, { supportSignature: true })
  .extend((c) => ({
    myLending: defineEntity((vault: Address, chainId: number) => ({
      depositAndBoost: ({ amount, userAddress }) => ({
        buildTx: () => myEncoder.encode({ vault, amount, userAddress }),
        getRequirements: async () => [
          await fetchApproval(c.viemClient, vault, amount, userAddress),
        ],
      }),
    })),
  }))
  .extend(() => ({ analytics: /* … */ }));

const tx = client
  .myLending(vault, 1)
  .depositAndBoost({ amount: 1n, userAddress })
  .buildTx();
```

### New surface (all in `packages/morpho-sdk`)

- `types/extension.ts`: `ExtensionAction`, `ExtensionEntity`, `ExtensionEntityFactory`,
  `ExtensionMap`.
- `types/error.ts`: `ExtensionNameCollisionError`, `InvalidExtensionNameError`,
  `InvalidExtensionShapeError`, `InvalidEntityShapeError`, `InvalidActionShapeError`,
  `InvalidTransactionShapeError`, `InvalidRequirementShapeError`.
- `helpers/validateExtension.ts`: `RESERVED_MORPHO_CLIENT_NAMES`, `validateExtensionMap`,
  `wrapExtensionFactory`. Internal but co-tested.
- `client/morphoClient.ts`: `extend` method, internal third constructor arg holding the extension
  map.
- `client/defineEntity.ts`: `defineEntity` identity helper.
- `types/client.ts`: `MorphoClientType.extend` declaration.

### Implementation Phases

- **Phase 1 — Types, errors, validators (this PR):** add the extension types, the seven typed
  errors, the `validateExtension` helpers and their colocated unit tests. No client changes yet.
- **Phase 2 — `MorphoClient.extend()` (this PR):** wire the method, the internal extensions map,
  the `defineEntity` helper, and update `MorphoClientType`. Colocated unit tests cover the happy
  path, chained extends, the original-not-mutated invariant, the freeze and metadata invariants,
  and every error path.
- **Phase 3 — Follow-ups (separate PRs):** integrate with `morphoViemExtension` so a viem-built
  `client.morpho` chain can call `.extend()` directly; consider re-exporting `deepFreeze` /
  `addTransactionMetadata` for integrator convenience if usage demand surfaces.

## Considered Alternatives

### Alternative 1: Subclassing `MorphoClient`

Integrators extend the class and add their own methods.

**Why rejected:** Couples integrators to our prototype chain, breaks `instanceof` against vendored
or pinned SDK versions, prevents accumulating multiple unrelated extensions (single inheritance),
and offers no validation surface — typos in method names are silent until call time.

### Alternative 2: Flat method extension (viem `walletClient.extend(walletActions)` style)

`extend` adds methods directly to the client root rather than namespaced entity factories.

**Why rejected:** The SDK's surface is organised by **entity** (`vaultV1`, `marketV1`, etc.), and
`client/CLAUDE.md` explicitly defines the client as a factory for entities. A flat extend would
mix integrator action methods with our entity factories, blurring the contract and making
collision detection harder. The namespaced approach also matches the AI-legibility rule in root
`AGENTS.md` §6: an agent reading `client.myLending.depositAndBoost(...)` immediately sees the
boundary between the SDK's surface and the integrator's.

### Alternative 3: Mutate `this` instead of returning a new client

`extend` would attach the new properties to the same instance and return it.

**Why rejected:** Violates the statelessness / immutability rule in `client/CLAUDE.md` ("Never
holds state beyond configuration"), and would surprise integrators who hold a reference to the
pre-extension client. Cloning is cheap because the client itself stores no runtime state.

### Alternative 4: Runtime `Proxy`-based dispatch

Use `new Proxy(client, { get })` to route extension property access.

**Why rejected:** Heavier stack traces, harder to serialize, and surprises tooling (devtools,
JSON, structuredClone). Direct `Object.defineProperty` keeps the instance shape transparent and
makes the non-writable invariant trivially testable.

### Alternative 5: Skip `defineEntity` entirely; rely on `satisfies`

Integrators define standalone factories with `… satisfies ExtensionEntityFactory`.

**Why rejected:** `satisfies` requires the integrator to know the public type name and import it.
`defineEntity` is more discoverable and produces the same TS narrowing in three lines of
implementation. Inline definitions still need neither helper, so the cost of shipping it is
negligible.

## Assumptions & Constraints

- TypeScript variadic-generic inference via `this & TExtension` accumulates types correctly across
  successive `.extend()` calls. Verified by colocated unit tests on `MorphoClient.extend()`.
- Integrators accept that runtime validation is structural, not type-driven: an action returning a
  `Transaction` whose `action.type` is unknown to the SDK is allowed. The SDK only validates
  shape, not semantics.
- The `useMaxParams: 2` Biome rule is respected by passing `{ entityName, methodName }` as a
  single options object to internal validator helpers.

## Dependencies

- No new runtime dependencies. The implementation uses only existing SDK types
  (`Transaction`, `Requirement`, `BaseAction`) and standard TS / JavaScript primitives.

## Security

- **Name collision is a hard error**, not a silent override. An integrator cannot shadow
  `vaultV1`, `marketV1`, `viemClient`, `options`, or `extend` themselves. Reserved names are
  centralised in `RESERVED_MORPHO_CLIENT_NAMES` and the list is the single source of truth.
- **Identifier whitelist**: extension names must match `/^[a-z][a-zA-Z0-9]*$/`. Rejects accidental
  prototype-pollution-style keys (`__proto__`, `constructor`, `_internal`).
- **Surfaced as non-writable / non-configurable own properties** via `Object.defineProperty`,
  preventing post-registration overwrite.
- **Validation is strict on the SDK's invariants** but **does not impose `deepFreeze`**: integrators
  remain responsible for freezing their own returned `Transaction` objects if they want
  the same immutability the built-in actions guarantee. This is a deliberate trade-off — the SDK
  does not own the integrator's transaction shape.
- **Metadata is not auto-injected** into integrator-built transactions. Built-in entities still
  apply `addTransactionMetadata` per the existing rules; integrators opt-in by calling the helper
  themselves.

## Future Considerations

- Re-export `deepFreeze` (from `@morpho-org/morpho-ts`) and `addTransactionMetadata` from the
  package barrel if integrator usage shows repeated re-imports.
- Add a viem-extension overload (`morphoViemExtension({ extend })`) so integrators using the
  viem-attached entry point can pre-register extensions in one call.
- A `client.extensions` introspection getter (read-only `string[]`) for tooling that wants to
  enumerate registered names. Not shipped now to keep the surface minimal.

## Open Questions

- Should `getRequirements()` validation enumerate the SDK's known `Requirement` action types and
  warn on unknown ones, or stay purely structural? Current proposal: stay structural — integrators
  may invent their own `Requirement` shapes on top of integrator-defined permit-like flows.

## References

- Root [`AGENTS.md`](../../AGENTS.md) §1 (Layering / Modularity / Testability), §2 (Forbidden
  patterns), §3 (Type discipline), §5 (Testing), §7 (Releases & versioning).
- [`packages/morpho-sdk/src/client/CLAUDE.md`](../../packages/morpho-sdk/src/client/CLAUDE.md) —
  client responsibilities and statelessness invariant.
- [`TIB-2026-05-04`](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md) — JSDoc rollout
  baseline applied to the new surface.
- viem `Client.extend` reference pattern (cf. `viem/clients/createClient.ts`).

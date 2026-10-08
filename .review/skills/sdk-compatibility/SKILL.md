---
name: sdk-compatibility
description: Integrator compatibility and SDK architecture in morpho-org/sdks-internal. Use when a change alters public exports, signatures, defaults, return values, thrown errors, package boundaries, layering, the morpho-sdk facade, entity flows (getRequirements, sign, buildTx) or deprecations. Checks what existing integrators will see and whether the change respects layer ownership, stateless flows and the deprecation lifecycle. Not for protocol semantics (sdk-protocol-safety) or changesets and dependency installs (sdk-release-integrity).
---

# Integrator compatibility and architecture

An SDK change is judged by what its consumers see. A change can type-check and
still break an integrator, by changing a default, an error class or when a
value is read, so trace real callers rather than signatures.

Apply each section only when its condition holds.

## 1. What existing integrators see

**Applies when** the diff changes anything re-exported from a package's
`src/index.ts` or a `package.json` `exports` subpath.

1. Find the callers: other packages in the monorepo, the package's tests and
   examples, and the JSDoc that documents the export.
2. For each changed export, compare before and after: inputs, defaults,
   return shape, thrown error classes, sync versus async, and when the value
   is read or computed. A change invisible to TypeScript is still a change.
3. Check the packaging contract it relies on: explicit re-export from
   `src/index.ts` (nothing else is public), ESM and CJS outputs, types, and
   both package exports and TS path mapping for a subpath.

Public fields are `readonly`, and new failure modes throw named, exported
error classes, not `Error`. A discriminated union with a `type` tag is
preferred to an options bag.

## 2. The morpho-sdk facade

**Applies when** the diff adds or changes a consumer-facing ABI, address,
constant, entity, error, fetcher, type or utility in `blue-sdk`,
`blue-sdk-viem` or `midnight-sdk`.

`morpho-sdk` is the canonical consumer package (§4). The same PR audits the
matching facade subpath:

- The raw `/blue/<category>` or `/midnight/<category>` surface and its
  unprefixed counterpart agree.
- Protocol-specific unprefixed names are `Blue`- or `Midnight`-qualified;
  genuinely shared symbols are not.
- Legacy ambiguous names are deprecated before removal.
- The facade doesn't grow into a new upstream surface only for parity.

## 3. Layers and package boundaries

**Applies when** the diff adds imports between packages, moves code between
layers, or adds a framework dependency.

- Dependencies point one way, `Client → Entity → Action` (§1 table). An entity
  encoding calldata, an action reading state, or a helper depending on an
  entity is a design failure to fix at the boundary, not with a shortcut.
- No deep imports across packages (§2 rule 5); the public surface is
  `src/index.ts`.
- Core packages stay framework-free: `react`, `wagmi`, `redux` and `ethers`
  live in named adapters (`*-wagmi`, `*-viem`). `blue-sdk` excludes viem;
  `midnight-sdk` may use viem for documented encoding and fetch boundaries.
- Internal `dependencies` use `workspace:` ranges; internal
  `peerDependencies` deliberately use explicit published ranges (§4).
- Relative imports carry `.js` (NodeNext), and an import used only for types
  uses `import type`. Biome enforces neither; report each miss as medium.

## 4. Stateless entity flows

**Applies when** the diff adds or changes an entity flow, an `ActionOutput`,
or code shared by `getRequirements()`, `sign()` and `buildTx()`.

Everything `buildTx` needs comes from its arguments, including data carried on
the `RequirementSignature` objects (`signature.args`). Look for an
`ActionOutput` closing over a `Map`, `Set`, array or object that signing
mutates and `buildTx` reads, or a `let` binding or memoized promise that
`buildTx` awaits. The one permitted mutable binding is an in-flight
`getRequirements()` promise shared by concurrent callers and cleared when it
settles.

Run the acceptance checklist in
`docs/adrs/ADR-2026-09-23-stateless-entity-flows.md` on every new or changed
flow. A side cache breaks preparing on one handle and finishing on another,
and serializing then resuming. This is a merge-blocking gate: report it as
critical even when the flow works on a single handle.

## 5. Ownership, immutability and class APIs

**Applies when** the diff adds or reshapes helpers, classes, `*Utils`
namespaces or exported types.

- Helpers never mutate inputs. They may return an input or reuse an object
  unless their documented contract promises a fresh one.
- Returned `Transaction` and signature descriptors are deep-frozen; class
  instances never are.
- A public helper that mainly returns a class instance is a static method
  (`Offer.create`), not a `*Utils` factory. Class methods delegate to pure
  `*Utils` functions that accept readonly plain objects of the class's shape.
  Classes aren't value bags.
- One exported shape per concept: an identical domain interface and ABI
  struct share one interface; a separate `*Struct` needs a real difference.
- A local non-exported helper needs three call sites; inline one-off and
  two-use helpers.
- Types at risk of upstream churn are declared locally rather than
  re-exported.

An architecture finding names the broken contract or the structural cost and
a grounded alternative. An unfamiliar pattern or a preference is not enough.

## 6. Deprecation lifecycle

**Applies when** the diff removes, renames or retypes a public symbol.

The default is four steps (§7): introduce the successor, deprecate with
`@deprecated` JSDoc, keep both for one minor, remove in the next major.
Skipping them needs one of these recorded exceptions, each limited to the
scope its ADR lists:

- **BlueBundlesV1 route** (`ADR-2026-08-25-blue-bundles-v1-sdk-actions`): the
  listed Blue route inputs and outputs, keeping method and action names. It
  does not cover Vault V1 reallocations, whose Blue and WDK flows need a
  published deprecation minor first.
- **Vault V2 `forceWithdraw` route** (`ADR-2026-08-28-vault-exit-force-withdraw`):
  the move to `VaultExitBundlesV1` and the retyped inputs, keeping names.
  `forceRedeem` is untouched.
- **Bundler3 primitives**
  (`ADR-2026-09-17-remove-bundler3-primitives-without-deprecation`): the
  low-level surfaces that record lists, across the five named packages.
- **EVM simulation v5**
  (`ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation` and
  `ADR-2026-10-02-evm-simulation-remove-legacy-authorization-variants-without-deprecation`):
  the Tenderly config and fallback, the two legacy authorization variants,
  and `"pending"` as a block number.
- **EVM simulation v6**
  (`ADR-2026-10-08-evm-simulation-viem-client-without-deprecation`):
  `SimulationConfig`, `ChainSimulationConfig`, `SimulateParams.chainId`,
  and the `simulate(config, params)` → `simulate(client, params)` retype.

No exception waives the major changeset, migration guide, maintained-dependent
audit or continued availability of the previous major, and no break outside
an exception's scope inherits it. Release duties are checked by
`sdk-release-integrity`.

## Severity

- **Critical:** `buildTx` reads state written by `getRequirements()` or
  `sign()`.
- **High:** a public break without the deprecation flow or an applicable
  exception; a framework import in a core package; a deep cross-package
  import.
- **Medium:** a layering reversal that compiles; a `*Utils` factory returning
  a class instance; class logic duplicated instead of delegated; a missing
  `readonly` on a public field; a generic `Error` thrown from an export.
- **Low:** reshaping a private helper.

## Report

Each finding names the export or flow, the caller that observes the change,
and the before-and-after behavior. Say which callers you read. Report packed
artifact or runtime checks you could not run as unavailable, separately from
what you inspected in source.

# TIB-0002: Consolidate SDK Package Consumption around @morpho-org/morpho-sdk

| Field             | Value       |
| ----------------- | ----------- |
| **Status**        | Proposed    |
| **Date**          | 2026-04-29  |
| **Author**        | @Rubilmax   |
| **Scope**         | Repo-wide   |
| **Supersedes**    | N/A         |
| **Superseded by** | N/A         |

---

## Context

The SDK monorepo exposes many public packages that are technically distinct but hard for end
consumers to reason about. Application developers must choose between protocol entity packages,
viem packages, Wagmi packages, simulation packages, bundler packages, and shared utility packages
before they can build a basic integration. This increases installation friction, documentation
surface, dependency management, and support cost.

The business goal is to simplify the end-consumer developer experience by lowering the number of
packages that can be consumed directly, streamlining installation, and making
`@morpho-org/morpho-sdk` the canonical package for Morpho application developers.

Several packages still have independent runtime consumers in this monorepo. This TIB therefore
uses a staged consolidation strategy: preserve current consumer-facing APIs where feasible, make
`morpho-sdk` own the internal packages it exposes as direct dependencies, keep the rest of the
package graph on peer dependency semantics, publish replacement APIs and migration notes first where
a replacement exists, then deprecate only the packages whose public surfaces are replaced or
explicitly unsupported.

## Goals / Non-Goals

**Goals**

- Make `@morpho-org/morpho-sdk` the primary public SDK entrypoint for application developers.
- Reduce the number of packages consumers need to install, import, and understand.
- Preserve the pre-existing SDK developer experience where feasible, including import style, public
  interfaces, runtime APIs, and consumption patterns.
- Keep `@morpho-org/morpho-ts`, `@morpho-org/blue-sdk`, and `@morpho-org/blue-sdk-viem` as
  maintained packages, while making them direct dependencies of `morpho-sdk` only.
- Re-export every fetcher from `blue-sdk-viem` and the classes from `blue-sdk` through
  `morpho-sdk`.
- Move selected bundler helpers and narrow reallocation helpers behind `morpho-sdk`.
- Deprecate legacy packages only after replacement APIs exist or the no-replacement decision is
  documented.
- Deprecate migration SDK packages, starting with `@morpho-org/migration-sdk-viem`, with no retained
  migration APIs.
- Deprecate all currently published `@morpho-labs/*` packages on npm with clear replacement
  guidance.
- Simplify reallocation computation by removing the broad simulation engine dependency from
  `morpho-sdk`.

**Non-Goals**

- Replacing deprecated Wagmi packages with new first-party React hooks in this TIB.
- Deprecating `@morpho-org/morpho-ts`, `@morpho-org/blue-sdk`, or
  `@morpho-org/blue-sdk-viem`.
- Converting every internal Morpho package relationship from peer dependencies to direct
  dependencies.
- Removing packages before maintained monorepo consumers have migrated.
- Rewriting unrelated SDKs such as liquidation, liquidity, or evm simulation beyond import-path
  migration needed by this consolidation.
- Editing generated build output under `lib/`.

## Current Solution

The current public SDK surface is split across several packages:

- `@morpho-org/morpho-sdk` exposes higher-level client, entity, action, helper, and type APIs.
- `@morpho-org/blue-sdk` exposes core protocol entities, math, constants, errors, addresses, and
  utility types.
- `@morpho-org/blue-sdk-viem` exposes viem ABIs, fetchers, signatures, typed-data helpers, viem
  utilities, and optional module augmentation for `blue-sdk` entities.
- `@morpho-org/bundler-sdk-viem` exposes action and bundle encoding utilities, with runtime
  dependencies on `simulation-sdk` and `blue-sdk-viem`.
- `@morpho-org/migration-sdk-viem` exposes migration position models, protocol migration
  addresses, third-party protocol fetchers, and migration transaction requirement types.
- `@morpho-org/simulation-sdk` exposes a broad mutable simulation state, operation types,
  dispatchers, handlers, simulation constants, and public allocator reallocation helpers.
- `@morpho-org/blue-sdk-wagmi`, `@morpho-org/simulation-sdk-wagmi`, and
  `@morpho-org/test-wagmi` expose React/Wagmi hooks and testing helpers.
- `@morpho-org/morpho-ts` exposes shared TypeScript utilities such as `Time`, `format`,
  `deepFreeze`, collection helpers, retry helpers, and shared URLs.
- The legacy `@morpho-labs/*` npm scope still contains published packages that should no longer be
  presented as current SDK entrypoints.

The dependency graph shows that several target packages are still consumed independently:

| Package | Used independently in monorepo? | Consequence |
| --- | --- | --- |
| `@morpho-org/morpho-ts` | Yes. Runtime dependency of `blue-sdk`, `evm-simulation`, `liquidity-sdk-viem`, `liquidation-sdk-viem`, `migration-sdk-viem`, `morpho-test`, `morpho-sdk`, and deprecated packages. | Keep as a maintained package. Only `morpho-sdk` moves it to a direct dependency for this consolidation; other packages keep their existing peer dependency model unless a separate decision changes it. |
| `@morpho-org/blue-sdk` | Yes. Heavily used by maintained packages. | Keep as a maintained package. `morpho-sdk` depends on it directly and re-exports its classes; `blue-sdk-viem` and other packages keep `blue-sdk` as a peer dependency. |
| `@morpho-org/blue-sdk-viem` | Yes. Runtime use in `liquidity-sdk-viem`, `liquidation-sdk-viem`, `migration-sdk-viem`, and `morpho-sdk`. | Keep as a maintained viem integration package. `morpho-sdk` depends on it directly and re-exports every fetcher; other packages keep their existing peer dependency model. |
| `@morpho-org/bundler-sdk-viem` | Yes. Runtime use in `migration-sdk-viem` and `morpho-sdk`. | Move selected action/bundle APIs into `morpho-sdk`; migrate or deprecate `migration-sdk-viem` before removal. |
| `@morpho-org/migration-sdk-viem` | No maintained monorepo runtime consumers outside its own package, tests, and documentation. | Deprecate as a public package. Retain no migration APIs under `morpho-sdk`; document that migration SDK workflows are no longer a supported public SDK surface. |
| `@morpho-org/simulation-sdk` | Yes. Runtime use in `bundler-sdk-viem`, `liquidity-sdk-viem`, `migration-sdk-viem`, and `morpho-sdk`. | Deprecate broad simulation engine, but first move required constants/types/helpers into owning packages. |
| `@morpho-org/blue-sdk-wagmi` | Only consumed by deprecated `simulation-sdk-wagmi`. | Deprecate directly; no first-party replacement hooks in this TIB. |
| `@morpho-org/simulation-sdk-wagmi` | Runtime only for itself; otherwise dev/test use. | Deprecate directly after internal consumers migrate. |
| `@morpho-org/test-wagmi` | Test-only helper for Wagmi package tests and some package test suites. | Deprecate public package; move any needed test helper internally or into `@morpho-org/test`. |

## Proposed Solution

Consolidate the public application-developer SDK experience around `@morpho-org/morpho-sdk`, while
keeping `morpho-ts`, `blue-sdk`, and `blue-sdk-viem` as maintained packages. `morpho-sdk` is the
single Morpho package entrypoint for application consumers, so it owns those internal packages as
direct dependencies. Other packages keep their peer dependency model.

`morpho-sdk` becomes the canonical application package by:

- depending directly on `blue-sdk` for protocol entities, math, constants, errors, addresses, and
  protocol value types when `morpho-sdk` imports them directly;
- re-exporting the public classes from `blue-sdk` through the `morpho-sdk` root export;
- consuming viem ABIs, fetchers, signatures, typed-data helpers, viem utilities, and deployless
  fetch types through a direct dependency on `blue-sdk-viem`;
- re-exporting every fetcher from `blue-sdk-viem` through `@morpho-org/morpho-sdk/fetch`;
- depending directly on `morpho-ts` where shared TypeScript utilities are part of its runtime or
  public API implementation;
- exposing selected bundler action and bundle encoding APIs currently required by `morpho-sdk` and
  migration flows;
- owning narrow public allocator reallocation types and helpers currently depending on
  `simulation-sdk`.

### Canonical `morpho-sdk` Export Hierarchy

Keep all consolidated consumer imports under the single `@morpho-org/morpho-sdk` package name.
Do not create package-name variants such as `@morpho-org/morpho-sdk-*` for these surfaces. Minimize
package subpaths: thin value, type, utility, action, client, and entity domains are re-exported from
the package root, while only fetch utilities, ABI literals, and side-effecting augmentation keep
dedicated public subpaths.

- `@morpho-org/morpho-sdk`: the primary application import surface. Re-export current
  `morpho-sdk` client, action, entity, helper, and type APIs from the root, and add root re-exports
  for `blue-sdk` entity barrels, addresses, constants, errors, math helpers, utility types,
  capacity helpers, viem parsing/restructuring helpers, and `blue-sdk-viem` signature helpers.
- `@morpho-org/morpho-sdk/fetch`: re-export `packages/blue-sdk-viem/src/fetch/index.ts`. This
  remains a dedicated subpath because fetchers are the network/read layer and are expected to be
  imported together.
- `@morpho-org/morpho-sdk/abis`: expose `blue-sdk-viem` ABI literals and the complete
  `bundler-sdk-viem` ABI barrel. This remains a dedicated subpath because ABI arrays are large,
  specialized constants that many root consumers do not need.
- `@morpho-org/morpho-sdk/augment`: expose the optional side-effecting module augmentation
  entrypoint. This is the only side-effecting public subpath.

Example imports after consolidation:

```ts
import { ChainId, Market, Token, Vault, safeParseUnits } from "@morpho-org/morpho-sdk";
import { fetchMarket, fetchToken, fetchVault } from "@morpho-org/morpho-sdk/fetch";
import { bundler3Abi } from "@morpho-org/morpho-sdk/abis";
import "@morpho-org/morpho-sdk/augment";
```

Implement the package export map exactly with these public subpaths:

```json
{
  "sideEffects": ["./lib/*/augment/**/*.js"],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./lib/esm/index.d.ts",
        "import": "./lib/esm/index.js",
        "require": "./lib/cjs/index.js"
      },
      "./abis": {
        "types": "./lib/esm/abis/index.d.ts",
        "import": "./lib/esm/abis/index.js",
        "require": "./lib/cjs/abis/index.js"
      },
      "./augment": {
        "types": "./lib/esm/augment/index.d.ts",
        "import": "./lib/esm/augment/index.js",
        "require": "./lib/cjs/augment/index.js"
      },
      "./fetch": {
        "types": "./lib/esm/fetch/index.d.ts",
        "import": "./lib/esm/fetch/index.js",
        "require": "./lib/cjs/fetch/index.js"
      }
    }
  }
}
```

Implement only `src/fetch/index.ts`, `src/abis/index.ts`, and `src/augment/index.ts` as package
subpath barrels. All other new barrels are internal source organization and are re-exported from
`packages/morpho-sdk/src/index.ts`.
Do not add public package subpaths such as `./actions`, `./client`, `./entities`, `./helpers`,
`./utils`, `./types`, `./math`, `./constants`, `./addresses`, `./errors`, or `./signatures`.

- `src/index.ts` re-exports the current `morpho-sdk` action, client, entity, helper, and type
  barrels, plus the new internal barrels for root-level `blue-sdk` and `blue-sdk-viem` surfaces.
- `src/entities/index.ts` is an internal root barrel that re-exports public `blue-sdk` market,
  token, holding, user, position, and vault entity entrypoints rather than a hand-maintained class
  list, so abstract/base entities such as vault adapter classes are not silently omitted.
- `src/utils/index.ts` is an internal root barrel. It re-exports current `morpho-sdk` helper
  functions from `src/helpers/index.ts`, `CapacityLimitReason` and `CapacityLimit` from `blue-sdk`,
  and `safeParseNumber`, `safeParseUnits`, `safeGetAddress`, `restructure`, and
  `readContractRestructured` from `blue-sdk-viem`.
- `src/types/index.ts` remains the merged root type barrel. It keeps the existing `morpho-sdk` type
  exports, except that the public `FetchParameters` name is owned by `blue-sdk-viem` and includes
  optional `chainId`. It also adds `Address`, `MarketId`, `BigIntish`, `Loadable`, `Failable`,
  `Fetchable`, `TransactionType`, `ChainId`, `ChainMetadata`, and `DeploylessFetchParameters`.
  `morpho-sdk` call sites that must not accept `chainId` should consume `FetchParameters` as
  `Omit<FetchParameters, "chainId">` or a clearly named local alias instead of exporting a second
  conflicting `FetchParameters` name or silently widening those signatures.
- `src/addresses/index.ts`, `src/constants/index.ts`, `src/errors/index.ts`, `src/math/index.ts`,
  and `src/signatures/index.ts` are internal root barrels, not package subpaths.

### Tree-Shakeability and Side Effects

The consolidation must not make the `morpho-sdk` root import pull in unused fetchers, ABI literals,
or side-effecting augmentation code.

- Set `package.json#sideEffects` to the narrow augmentation whitelist shown in the export map
  snippet. This marks every non-augmentation artifact as side-effect free while preserving the
  explicit `@morpho-org/morpho-sdk/augment` side effect.
- Do not set package-wide `sideEffects` to `true`; the whitelist is the side-effect-free posture
  with only augmentation opted back in.
- If augmentation is removed in a later TIB, replace the whitelist with `"sideEffects": false`.
- `src/index.ts`, `src/fetch/index.ts`, and `src/abis/index.ts` must never top-level import
  `src/augment/index.ts` or any module that mutates `blue-sdk` prototypes.
- Root imports from `blue-sdk-viem` must target pure source modules directly, such as signatures,
  types, or utils. The `morpho-sdk` root must not import the `blue-sdk-viem` root barrel because
  that barrel also re-exports fetchers and ABIs.
- `src/augment/index.ts` is the only entrypoint allowed to top-level import side-effecting
  augmentation modules.
- Public entrypoint barrels must use explicit named re-exports rather than `export *` chains.
  Internal entity/type export lists may be generated or covered by reviewer checklist items so new
  upstream public entities are not silently omitted, but the published entrypoint files should stay
  explicit for older bundlers' dead-code elimination.
- Phase 2 must include a bundle-impact verification step that compares the consolidated branch
  against `origin/main` using the same bundler configuration. The check must cover at least a root
  import, a `/fetch` import, a `/abis` import, and an `/augment` import, and report whether root
  imports accidentally retain fetch, ABI, or augmentation code.

### Developer Experience Preservation

Preserve current SDK consumption patterns where feasible. This includes module augmentation when
consumers already rely on it, but module augmentation is an implementation detail of the broader
developer-experience goal.

- Preserve existing public interfaces and runtime behavior unless a package boundary change makes a
  migration unavoidable.
- Keep existing `blue-sdk-viem` ergonomics available through `blue-sdk-viem` exports and
  `morpho-sdk` root or subpath exports during the transition.
- Avoid forcing application consumers to install or import `morpho-ts`, `blue-sdk`, or
  `blue-sdk-viem` when they only use `morpho-sdk`.
- Document any import-path changes with one-to-one migration guidance. Deprecated packages have no
  wrapper compatibility window.

The implementation may still expose side-effect augmentation entrypoints and explicit helper
functions where those preserve existing usage, but the success criterion is stable SDK consumption,
not preserving a specific augmentation mechanism for its own sake.

### Reallocation Simplification

Keep the current friendly-then-aggressive public allocator algorithm, but remove the broad
simulation engine from `morpho-sdk`:

- replace `SimulationState` inputs with a narrow local reallocation data shape containing only the
  market, vault, vault market config, position, holding, and block data needed by the algorithm;
- extract small helper functions for candidate withdrawal computation, reallocation state updates,
  target-market capacity checks, and vault grouping;
- preserve current output invariants: positive withdrawal amounts, no withdrawals from the target
  market, strictly sorted withdrawals per vault, vault fee inclusion, and deterministic ordering;
- move approval and reallocation constants currently imported from `simulation-sdk` into the owning
  `morpho-sdk` API surface before deprecating `simulation-sdk`.

### Extraction Targets Before Deprecation

Before `bundler-sdk-viem` or `simulation-sdk` can be deprecated, `morpho-sdk` must own the narrow
runtime surfaces it currently imports or exposes through its higher-level actions, plus the full
bundler ABI surface that consumers may need after `bundler-sdk-viem` is deprecated.

From `packages/bundler-sdk-viem` extract into `morpho-sdk`:

- `src/BundlerAction.ts`: `BundlerAction.encodeBundle`, `BundlerAction.encode`, `BundlerCall`, and
  the action encoders needed by current `morpho-sdk` action builders: `nativeTransfer`,
  `wrapNative`, `erc20TransferFrom`, `erc20Transfer`, `permit`, `approve2`, `transferFrom2`,
  `erc4626Deposit`, `erc4626Redeem`, `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`,
  `morphoWithdrawCollateral`, and `publicAllocatorReallocateTo`.
- `src/types/actions.ts`: the `Action` discriminated union and supporting types used to build those
  bundles, including `ActionArgs`, `ActionType`, `Actions`, `Authorization`, `InputReallocation`,
  `Permit2PermitSingleDetails`, and `Permit2PermitSingle`.
- `src/abis.ts`: the complete ABI barrel from `bundler-sdk-viem`, not only the ABI literals used by
  current `morpho-sdk` actions. Extract and re-export `universalRewardsDistributorAbi`,
  `bundler3Abi`, `coreAdapterAbi`, `generalAdapter1Abi`, `ethereumGeneralAdapter1Abi`,
  `paraswapAdapterAbi`, `erc20WrapperAdapterAbi`, `aaveV2MigrationAdapterAbi`,
  `aaveV3MigrationAdapterAbi`, `aaveV3OptimizerMigrationAdapterAbi`,
  `compoundV2MigrationAdapterAbi`, and `compoundV3MigrationAdapterAbi` from
  `@morpho-org/morpho-sdk/abis`.
- `src/errors.ts`: the `BundlerErrors` namespace members thrown by the extracted encoders:
  `MissingSignature`, `UnexpectedAction`, and `UnexpectedSignature`.
- `src/operations.ts`: `DEFAULT_SUPPLY_TARGET_UTILIZATION`, currently used by
  `computeReallocations`.

Do not extract `ActionBundle`, `ActionBundleRequirements`, operation-level simulation helpers
(`populateBundle`, `populateSubBundle`, `finalizeBundle`, `simulateBundlerOperation`,
`simulateBundlerOperations`, or `handleBundlerOperation`), migration adapter actions, Paraswap
actions, or reward-claim actions unless `morpho-sdk` intentionally exposes those workflows later.
The ABI literals above are the only parts of those workflows that move unconditionally. No
`bundler-sdk-viem` classes are required by the current `morpho-sdk` action API.

From `packages/simulation-sdk` extract or replace inside `morpho-sdk`:

- `src/constants.ts`: `APPROVE_ONLY_ONCE_TOKENS` and `MAX_TOKEN_APPROVALS`, used by approval
  requirement encoding.
- `src/SimulationState.ts`: replace the broad `SimulationState` dependency with a local
  reallocation data shape and helpers covering only `MinimalBlock`, `PublicAllocatorOptions`,
  `PublicReallocation`, market lookup, vault lookup, vault market config lookup, accrual position
  lookup, and the `getMarketPublicReallocations` algorithm used by `computeReallocations`.
- `src/SimulationState.ts`: keep the `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION` default with the
  local public allocator options.
- `src/errors.ts`: recreate only the local typed failures needed by the extracted reallocation
  helpers, such as unknown market, vault, vault-market-config, and position cases. Do not copy the
  full simulation error namespace.
- `src/operations.ts`: no broad operation unions are required for `morpho-sdk` reallocations after
  the local reallocation data shape exists; keep `BlueOperation`, `MetaMorphoOperation`,
  `Erc20Operation`, `ParaswapOperation`, and dispatcher types out of `morpho-sdk`.
- `src/helpers/mutative.ts` and `src/helpers/paraswap.ts`: no utilities are required for the
  current extraction. Do not extract `getCurrent`, `augustusV6_2Address`,
  `paraswapContractMethodOffsets`, or `getParaswapContractMethodOffsets` unless Paraswap workflows
  move into `morpho-sdk`.

Before removing either dependency, reviewers must explicitly sign off that extracted bundle
calldata encoding, approval constants, and friendly/aggressive public allocator reallocation
behavior match the intended existing behavior.

### Workspace Deprecation Scope

Deprecate replaced `@morpho-org/*` workspace packages only after the implementation phases provide
their replacement paths or document that no replacement exists. There is no compatibility window and
no wrapper release for deprecated packages.

Use these npm deprecation messages:

| Package | Replacement | npm deprecation message |
| --- | --- | --- |
| `@morpho-org/bundler-sdk-viem` | `@morpho-org/morpho-sdk` | `Deprecated: use @morpho-org/morpho-sdk. Bundler action helpers are consolidated under @morpho-org/morpho-sdk and ABIs are under @morpho-org/morpho-sdk/abis.` |
| `@morpho-org/migration-sdk-viem` | None | `Deprecated: no replacement package. Migration SDK workflows are no longer a supported public SDK surface.` |
| `@morpho-org/simulation-sdk` | `@morpho-org/morpho-sdk` | `Deprecated: use @morpho-org/morpho-sdk for supported reallocation helpers. The broad simulation engine has no replacement package.` |
| `@morpho-org/blue-sdk-wagmi` | None | `Deprecated: no replacement package. First-party Wagmi hooks are no longer a supported public SDK surface.` |
| `@morpho-org/simulation-sdk-wagmi` | None | `Deprecated: no replacement package. First-party Wagmi hooks are no longer a supported public SDK surface.` |
| `@morpho-org/test-wagmi` | None | `Deprecated: no replacement package. This public Wagmi test helper package is no longer supported.` |

If additional migration SDK packages are introduced or discovered before implementation, include
them in the same migration SDK deprecation campaign with replacement `None` unless a later TIB
explicitly adds the workflow to `morpho-sdk`.

### npm Deprecation Scope

Deprecate every currently published `@morpho-labs/*` package on npm. Do not unpublish these
packages. Each deprecation message points either to `@morpho-org/morpho-sdk` or to no replacement.

At the time of this TIB, use these npm deprecation messages:

| Package | Replacement | npm deprecation message |
| --- | --- | --- |
| `@morpho-labs/ethers-fallback-provider` | None | `Deprecated: no replacement package.` |
| `@morpho-labs/ethers-multicall` | None | `Deprecated: no replacement package.` |
| `@morpho-labs/ethers-utils` | None | `Deprecated: no replacement package.` |
| `@morpho-labs/gitbook-cli` | None | `Deprecated: no replacement package.` |
| `@morpho-labs/gnosis-tx-builder` | None | `Deprecated: no replacement package.` |
| `@morpho-labs/morpho-ethers-contract` | `@morpho-org/morpho-sdk` | `Deprecated: use @morpho-org/morpho-sdk for maintained Morpho SDK APIs.` |
| `@morpho-labs/morpho-rewards` | `@morpho-org/morpho-sdk` | `Deprecated: use @morpho-org/morpho-sdk for maintained Morpho SDK APIs and ABIs.` |
| `@morpho-labs/v2-deployment` | None | `Deprecated: no replacement package.` |

If new `@morpho-labs/*` packages are discovered before implementation, include them in the same
deprecation campaign.

### Implementation Phases

- **Phase 1 -- Add canonical consumer path:** Update `morpho-sdk` to depend directly on
  `blue-sdk-viem`, `blue-sdk`, and `morpho-ts` where needed, and update docs to present
  `pnpm add @morpho-org/morpho-sdk` as the primary Morpho application install path. Update package
  READMEs and public docs to warn that installing `morpho-sdk` together with incompatible direct
  versions of `blue-sdk`, `blue-sdk-viem`, or `morpho-ts` is unsupported after this consolidation,
  because duplicate runtime copies can create distinct class identities and break `instanceof`
  comparisons across package boundaries.
- **Phase 2 -- Re-export dependency surfaces:** Re-export every fetcher from `blue-sdk-viem`
  through `@morpho-org/morpho-sdk/fetch`, the classes and thin utility/type surfaces from
  `blue-sdk` through the `morpho-sdk` root, and the full ABI surface through
  `@morpho-org/morpho-sdk/abis`, so application code can keep a single Morpho package entrypoint.
  Add `package.json#sideEffects`, isolate augmentation under `@morpho-org/morpho-sdk/augment`, and
  run the bundle-impact verification against `origin/main`.
- **Phase 3 -- Preserve peer dependencies elsewhere:** Keep `blue-sdk`, `blue-sdk-viem`, and
  `morpho-ts` as peer dependencies for packages other than `morpho-sdk` unless a separate package
  decision changes that relationship.
- **Phase 4 -- Extract bundler and simulation prerequisites:** Move the explicit extraction targets
  above into `morpho-sdk`, keep the extracted public API behind `morpho-sdk` exports, and require
  reviewer sign-off on extracted behavior before any deprecation notice is published.
- **Phase 5 -- Simplify simulation and reallocations:** Replace `morpho-sdk`'s `SimulationState`
  dependency with local reallocation helpers. Move approval constants, public allocator option
  types, and other narrow constants out of `simulation-sdk` into their owning APIs.
- **Phase 6 -- Add migrated-code test coverage:** Require high coverage for code migrated into
  `morpho-sdk`, with focused unit tests for extracted helpers and package-boundary coverage for
  newly re-exported or side-effecting entrypoints. The exact fixture shape is an implementation
  detail, but migrated behavior must not rely on review alone.
- **Phase 7 -- Migration SDK deprecation prep:** Retain no migration APIs. Document that migration
  SDK workflows are no longer a supported public SDK surface and deprecate
  `@morpho-org/migration-sdk-viem` with replacement `None`.
- **Phase 8 -- Release workflow updates:** Enforce the changeset cascade rule below so dependent
  packages receive a new version in the same release when `morpho-sdk` publishes a new consolidated
  internal dependency surface.
- **Phase 9 -- Deprecation:** Run npm deprecation notices only for packages whose public surfaces
  are replaced or explicitly unsupported, while keeping `morpho-ts`, `blue-sdk`, and
  `blue-sdk-viem` maintained. There is no compatibility window and no wrapper release. Remove
  deprecated workspace packages after the source-code deletion delay defined by
  [TIB-0003](./TIB-0003-sdk-package-deprecation-lifecycle.md). Deprecate every package in the
  workspace deprecation scope and every package in the `@morpho-labs/*` npm deprecation scope with
  the exact messages above.

## Considered Alternatives

### Alternative 1: Keep Packages Split and Improve Documentation

Keep the existing package architecture and only improve README guidance.

**Why rejected:** Documentation can reduce confusion, but it does not reduce install choices,
package discovery burden, peer dependency friction, or support surface for end consumers.

### Alternative 2: Immediate Removal

Remove deprecated workspace packages and npm-deprecate existing published versions immediately.

**Why rejected:** Several packages have runtime consumers inside the monorepo. Immediate removal
would force a large, risky migration and could break downstream users before replacement APIs are
published.

### Alternative 3: Deprecate or Absorb morpho-ts

Move all `morpho-ts` utilities into `morpho-sdk` or another package and deprecate `morpho-ts`.

**Why rejected:** `morpho-ts` is used independently by maintained packages outside the consumer SDK
consolidation path. Keeping it as a direct dependency of `morpho-sdk` preserves package ownership
while removing the need for application consumers to install it as a peer dependency.

### Alternative 4: Remove Module Augmentation

Move only explicit viem helper functions into `morpho-sdk` and drop side-effect augmentation
entrypoints.

**Why rejected:** Existing `blue-sdk-viem` consumers may use augmentation to attach fetch helpers to
entity classes. Preserving that developer experience where feasible reduces migration cost while
still allowing explicit helper imports for consumers who prefer side-effect-free APIs.

## Assumptions & Constraints

- `@morpho-org/morpho-sdk` is the canonical package for application developers after this
  consolidation.
- `@morpho-org/morpho-ts`, `@morpho-org/blue-sdk`, and `@morpho-org/blue-sdk-viem` remain
  independently maintained because maintained packages still use them at runtime.
- `morpho-sdk` may use internal Morpho packages as direct dependencies because it is the single
  Morpho package entrypoint for application consumers.
- Other package relationships remain peer dependencies unless a separate package-level decision
  changes them.
- Package deprecations happen only after replacement APIs or no-replacement migration notes are
  available.
- Migration SDK package deprecation keeps no retained APIs and uses replacement `None`.
- Legacy `@morpho-labs/*` package deprecations are npm metadata changes only; they should not
  unpublish packages or remove historical versions.
- Deprecated packages do not get wrapper releases or a compatibility window.
- Public package APIs remain explicit re-exports from `src/index.ts` and package export maps.
- Source and tests are changed under `packages/*/src` and `packages/*/test`; generated `lib/`
  output is not edited.

## Dependencies

- `viem` remains a peer dependency for consumer-facing Ethereum client and ABI functionality.
- `@morpho-org/morpho-sdk` depends directly on `@morpho-org/morpho-ts`,
  `@morpho-org/blue-sdk`, and `@morpho-org/blue-sdk-viem`.
- `@morpho-org/blue-sdk-viem` keeps `@morpho-org/blue-sdk` as a peer dependency.
- Packages other than `morpho-sdk` keep `morpho-ts`, `blue-sdk`, and `blue-sdk-viem` as peer
  dependencies when they need those packages.
- README and documentation updates must explicitly warn that applications installing `morpho-sdk`
  alongside incompatible direct versions of `blue-sdk`, `blue-sdk-viem`, or `morpho-ts` are not
  supported after this consolidation. Mixed incompatible versions can produce duplicate class
  definitions, so `instanceof` and other identity-sensitive checks may fail even when structural
  data is equivalent.
- Published packages do not bundle internal dependencies; they publish dependency ranges. The
  changeset author owns cross-package version-bump coordination.
- Changeset cascade rule: when `@morpho-org/morpho-sdk` gets a minor changeset because it
  re-exports a new public class, utility, type, fetcher, ABI, or signature from
  `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem`, or `@morpho-org/morpho-ts`, the same
  changeset must include patch bumps for `@morpho-org/liquidity-sdk-viem`,
  `@morpho-org/liquidation-sdk-viem`, and `@morpho-org/migration-sdk-viem`.
- The same patch cascade is required when `morpho-sdk` changes the dependency range for
  `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem`, or `@morpho-org/morpho-ts`, even if the
  dependent package source code does not change. This prevents downstream lockfiles from silently
  pinning stale transitive internal SDK versions.
- Release reviewers must block the release PR when the required cascade changeset entries are
  missing. No separate CI graph check is required by this TIB.
- npm publish permissions are required for replacement releases and deprecation notices across both
  the `@morpho-org` and `@morpho-labs` npm scopes.

## Security

Consolidation changes import paths and package ownership, but it must not weaken transaction
encoding, authorization, approval, permit, or reallocation invariants.

- Reallocation simplification must preserve public allocator checks, max-in/max-out constraints,
  supply cap handling, sorted withdrawals, fee accounting, and target-market exclusion.
- Moving selected bundler helpers into `morpho-sdk` and changing internal dependency ownership must
  preserve encoded calldata behavior for existing actions, with reviewer sign-off before release.
- `morpho-sdk` subpath exports must not introduce hidden side effects beyond existing augmentation
  behavior.
- Deprecated packages should clearly warn consumers whether future supported SDK fixes are available
  through `@morpho-org/morpho-sdk` or whether there is no replacement.
- Legacy `@morpho-labs/*` deprecation notices should make clear that those packages are no longer
  the supported path for future SDK fixes.

## Observability

Track migration success through:

- npm download trends for deprecated packages, including the legacy `@morpho-labs/*` packages,
  versus their replacement packages where applicable;
- npm download trends for `@morpho-org/migration-sdk-viem` after its no-replacement deprecation;
- support issues caused by import path migration or missing exports;
- package install size and dependency count for the canonical consumer path;
- migrated-code unit and package-boundary coverage for helpers, exports, and side-effecting
  entrypoints;
- review checklist coverage for `morpho-sdk` subpath exports and augmentation entrypoints during
  the transition.

## References

- [morpho-sdk architecture](../../packages/morpho-sdk/ARCHITECTURE.md)
- [SDK package deprecation lifecycle](./TIB-0003-sdk-package-deprecation-lifecycle.md)
- [blue-sdk package](../../packages/blue-sdk/)
- [blue-sdk-viem package](../../packages/blue-sdk-viem/)
- [bundler-sdk-viem package](../../packages/bundler-sdk-viem/)
- [migration-sdk-viem package](../../packages/migration-sdk-viem/)
- [simulation-sdk package](../../packages/simulation-sdk/)
- [morpho-ts package](../../packages/morpho-ts/)

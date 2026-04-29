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
package graph on peer dependency semantics, publish replacement APIs and migration notes first, then
deprecate only the packages whose public surfaces are replaced.

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
- Deprecate legacy packages only after replacement APIs or compatibility paths exist.
- Simplify reallocation computation by removing the broad simulation engine dependency from
  `morpho-sdk`.

**Non-Goals**

- Replacing deprecated Wagmi packages with new first-party React hooks in this TIB.
- Deprecating `@morpho-org/morpho-ts`, `@morpho-org/blue-sdk`, or
  `@morpho-org/blue-sdk-viem`.
- Converting every internal Morpho package relationship from peer dependencies to direct
  dependencies.
- Removing packages before maintained monorepo consumers have migrated.
- Rewriting unrelated SDKs such as liquidation, liquidity, migration, or evm simulation beyond
  import-path migration needed by this consolidation.
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
- `@morpho-org/simulation-sdk` exposes a broad mutable simulation state, operation types,
  dispatchers, handlers, simulation constants, and public allocator reallocation helpers.
- `@morpho-org/blue-sdk-wagmi`, `@morpho-org/simulation-sdk-wagmi`, and
  `@morpho-org/test-wagmi` expose React/Wagmi hooks and testing helpers.
- `@morpho-org/morpho-ts` exposes shared TypeScript utilities such as `Time`, `format`,
  `deepFreeze`, collection helpers, retry helpers, and shared URLs.

The dependency graph shows that several target packages are still consumed independently:

| Package | Used independently in monorepo? | Consequence |
| --- | --- | --- |
| `@morpho-org/morpho-ts` | Yes. Runtime dependency of `blue-sdk`, `evm-simulation`, `liquidity-sdk-viem`, `liquidation-sdk-viem`, `migration-sdk-viem`, `morpho-test`, `morpho-sdk`, and deprecated packages. | Keep as a maintained package. Only `morpho-sdk` moves it to a direct dependency for this consolidation; other packages keep their existing peer dependency model unless a separate decision changes it. |
| `@morpho-org/blue-sdk` | Yes. Heavily used by maintained packages. | Keep as a maintained package. `morpho-sdk` depends on it directly and re-exports its classes; `blue-sdk-viem` and other packages keep `blue-sdk` as a peer dependency. |
| `@morpho-org/blue-sdk-viem` | Yes. Runtime use in `liquidity-sdk-viem`, `liquidation-sdk-viem`, `migration-sdk-viem`, and `morpho-sdk`. | Keep as a maintained viem integration package. `morpho-sdk` depends on it directly and re-exports every fetcher; other packages keep their existing peer dependency model. |
| `@morpho-org/bundler-sdk-viem` | Yes. Runtime use in `migration-sdk-viem` and `morpho-sdk`. | Move selected action/bundle APIs into `morpho-sdk`; migrate `migration-sdk-viem` before removal. |
| `@morpho-org/simulation-sdk` | Yes. Runtime use in `bundler-sdk-viem`, `liquidity-sdk-viem`, `migration-sdk-viem`, and `morpho-sdk`. | Deprecate broad simulation engine, but first move required constants/types/helpers into owning packages. |
| `@morpho-org/blue-sdk-wagmi` | Only consumed by deprecated `simulation-sdk-wagmi`. | Deprecate directly; no first-party replacement hooks in this TIB. |
| `@morpho-org/simulation-sdk-wagmi` | Runtime only for itself; otherwise dev/test use. | Deprecate directly after tests migrate. |
| `@morpho-org/test-wagmi` | Test-only helper for Wagmi package tests and some package test suites. | Deprecate public package; move any needed test helper internally or into `@morpho-org/test`. |

## Proposed Solution

Consolidate the public application-developer SDK experience around `@morpho-org/morpho-sdk`, while
keeping `morpho-ts`, `blue-sdk`, and `blue-sdk-viem` as maintained packages. `morpho-sdk` is the
single Morpho package entrypoint for application consumers, so it owns those internal packages as
direct dependencies. Other packages keep their peer dependency model.

`morpho-sdk` becomes the canonical application package by:

- depending directly on `blue-sdk` for protocol entities, math, constants, errors, addresses, and
  protocol value types when `morpho-sdk` imports them directly;
- re-exporting the public classes from `blue-sdk`;
- consuming viem ABIs, fetchers, signatures, typed-data helpers, viem utilities, and deployless
  fetch types through a direct dependency on `blue-sdk-viem`;
- re-exporting every fetcher from `blue-sdk-viem`;
- depending directly on `morpho-ts` where shared TypeScript utilities are part of its runtime or
  public API implementation;
- exposing selected bundler action and bundle encoding APIs currently required by `morpho-sdk` and
  migration flows;
- owning narrow public allocator reallocation types and helpers currently depending on
  `simulation-sdk`.

### Developer Experience Preservation

Preserve current SDK consumption patterns where feasible. This includes module augmentation when
consumers already rely on it, but module augmentation is an implementation detail of the broader
developer-experience goal.

- Preserve existing public interfaces and runtime behavior unless a package boundary change makes a
  migration unavoidable.
- Keep existing `blue-sdk-viem` ergonomics available through `blue-sdk-viem` exports and
  compatibility paths during the transition.
- Avoid forcing application consumers to install or import `morpho-ts`, `blue-sdk`, or
  `blue-sdk-viem` when they only use `morpho-sdk`.
- Document any import-path changes with one-to-one migration guidance and compatibility windows.

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
runtime surfaces it currently imports or exposes through its higher-level actions.

From `packages/bundler-sdk-viem` extract into `morpho-sdk`:

- `src/BundlerAction.ts`: `BundlerAction.encodeBundle`, `BundlerAction.encode`, `BundlerCall`, and
  the action encoders needed by current `morpho-sdk` action builders: `nativeTransfer`,
  `wrapNative`, `erc20TransferFrom`, `erc20Transfer`, `permit`, `approve2`, `transferFrom2`,
  `erc4626Deposit`, `erc4626Redeem`, `morphoSupplyCollateral`, `morphoBorrow`, `morphoRepay`,
  `morphoWithdrawCollateral`, and `publicAllocatorReallocateTo`.
- `src/types/actions.ts`: the `Action` discriminated union and supporting types used to build those
  bundles, including `ActionArgs`, `ActionType`, `Actions`, `Authorization`, `InputReallocation`,
  `Permit2PermitSingleDetails`, and `Permit2PermitSingle`.
- `src/abis.ts`: only the ABI literals required by the extracted encoders, including `bundler3Abi`,
  `generalAdapter1Abi`, `ethereumGeneralAdapter1Abi`, `coreAdapterAbi`, and
  `erc20WrapperAdapterAbi`. Keep migration, Paraswap, and reward adapter ABIs out of `morpho-sdk`
  unless a `morpho-sdk` action needs them.
- `src/errors.ts`: the `BundlerErrors` namespace members thrown by the extracted encoders:
  `MissingSignature`, `UnexpectedAction`, and `UnexpectedSignature`.
- `src/operations.ts`: `DEFAULT_SUPPLY_TARGET_UTILIZATION`, currently used by
  `computeReallocations`.

Do not extract `ActionBundle`, `ActionBundleRequirements`, operation-level simulation helpers
(`populateBundle`, `populateSubBundle`, `finalizeBundle`, `simulateBundlerOperation`,
`simulateBundlerOperations`, or `handleBundlerOperation`), migration adapter actions, Paraswap
actions, or reward-claim actions unless `morpho-sdk` intentionally exposes those workflows later.
No `bundler-sdk-viem` classes are required by the current `morpho-sdk` action API.

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

The implementation should add parity tests before removing either dependency: bundle calldata
parity for every extracted `BundlerAction` action type, approval constant parity, and reallocation
output parity for friendly and aggressive public allocator paths.

### Implementation Phases

- **Phase 1 -- Add canonical consumer path:** Update `morpho-sdk` to depend directly on
  `blue-sdk-viem`, `blue-sdk`, and `morpho-ts` where needed, and update docs to present
  `pnpm add @morpho-org/morpho-sdk` as the primary Morpho application install path.
- **Phase 2 -- Re-export dependency surfaces:** Re-export every fetcher from `blue-sdk-viem` and
  the classes from `blue-sdk` through `morpho-sdk` so application code can keep a single Morpho
  import entrypoint.
- **Phase 3 -- Preserve peer dependencies elsewhere:** Keep `blue-sdk`, `blue-sdk-viem`, and
  `morpho-ts` as peer dependencies for packages other than `morpho-sdk` unless a separate package
  decision changes that relationship.
- **Phase 4 -- Extract bundler and simulation prerequisites:** Move the explicit extraction targets
  above into `morpho-sdk`, keep the extracted public API behind `morpho-sdk` exports, and add parity
  tests before any deprecation notice is published.
- **Phase 5 -- Simplify simulation and reallocations:** Replace `morpho-sdk`'s `SimulationState`
  dependency with local reallocation helpers. Move approval constants, public allocator option
  types, and other narrow constants out of `simulation-sdk` into their owning APIs.
- **Phase 6 -- Release workflow updates:** Ensure changesets and release tooling cascade dependent
  package versions when a direct dependency range changes or when a dependent package must guarantee
  a newly published internal dependency version.
- **Phase 7 -- Compatibility and deprecation:** Publish final compatibility releases or
  migration-only releases. Run npm deprecation notices only for packages whose public surfaces are
  replaced, while keeping `morpho-ts`, `blue-sdk`, and `blue-sdk-viem` maintained. Remove deprecated
  workspace packages after downstream migration.

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
- Package deprecations happen only after replacement APIs, migration notes, or compatibility
  wrappers are available.
- Compatibility packages may temporarily depend on the replacement package to forward old imports
  while npm deprecation notices guide users to the canonical package.
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
- Published packages do not bundle internal dependencies; they publish dependency ranges. A
  dependent package needs a new release when its dependency range changes, when its code relies on
  a new internal dependency version, or when the release process must guarantee that downstream
  consumers receive that newer transitive version. Compatible dependency releases already covered
  by an existing range do not strictly require a dependent package release, though lockfiles may
  still need updating.
- npm publish permissions are required for compatibility releases and deprecation notices.

## Security

Consolidation changes import paths and package ownership, but it must not weaken transaction
encoding, authorization, approval, permit, or reallocation invariants.

- Reallocation simplification must preserve public allocator checks, max-in/max-out constraints,
  supply cap handling, sorted withdrawals, fee accounting, and target-market exclusion.
- Moving selected bundler helpers into `morpho-sdk` and changing internal dependency ownership must
  preserve encoded calldata parity for existing tested actions.
- Compatibility wrappers must not introduce hidden side effects beyond existing augmentation
  behavior.
- Deprecated packages should clearly warn consumers which replacement package will receive future
  security fixes after the deprecation window.

## Observability

Track migration success through:

- npm download trends for deprecated packages versus their replacement packages;
- support issues caused by import path migration or missing exports;
- package install size and dependency count for the canonical consumer path;
- CI coverage for compatibility wrappers and augmentation entrypoints during the transition.

## References

- [morpho-sdk architecture](../packages/morpho-sdk/ARCHITECTURE.md)
- [blue-sdk package](../packages/blue-sdk/)
- [blue-sdk-viem package](../packages/blue-sdk-viem/)
- [bundler-sdk-viem package](../packages/bundler-sdk-viem/)
- [simulation-sdk package](../packages/simulation-sdk/)
- [morpho-ts package](../packages/morpho-ts/)

# Engineering Rules

> Mission, scope, and values: see [`MISSION.md`](./MISSION.md). The rules below are how we build it.

Where present, `CLAUDE.md` is a symlink to `AGENTS.md` at every level — same content, two filenames so any agent finds it. Per-package `AGENTS.md` files refine these rules for a specific package; they may add detail but **must not contradict this file**. When in doubt, the root wins.

Every PR is measured against the rules below. A change that violates an architectural principle doesn't land — we question the change before we question the principle.

> **Enforcement note.** The Biome formatter, knip, the fork harness in `@morpho-org/test`, and Changesets generation enforce some rules below. Biome's `noExcessiveCognitiveComplexity` (maximum 50), `noExcessiveLinesPerFunction` (maximum 120, skipping blank lines), `noNestedTernary`, `useCollapsedElseIf`, `noNegationElse`, `useBlockStatements`, `noNonNullAssertion`, `noExplicitAny` and `noTsIgnore` are errors in every package's `src/`, except in `*.test.ts` files and anything under a `test/` directory within `src/`.
>
> Most rules are **review-time conventions**, including JSDoc on every export, §2 patterns not covered by Biome (such as `as unknown as`, framework imports, and mocked viem clients on RPC paths), changeset requirements, and full coverage thresholds. Treat them as binding even when tooling does not enforce them.

> **Review personas.** The review-time conventions above are applied at PR review by specialized personas under [`.agents/pr-review-engine/agents/`](./.agents/pr-review-engine/agents/), invoked locally by the `/review-pr-{gh,local}` slash commands. See [§10](#10-review-automation--cirelease-security) for the full inventory and the CI/release rules they anchor. When a rule below changes, the matching persona's bullet must change with it — the backlinks on each section name the personas to update.

---

## 1. Architecture

Repo-wide principles. The `Client → Entity → Action` layering of `morpho-sdk`, its stateless entity flows and its frozen `Transaction` outputs are specified in [`packages/morpho-sdk/AGENTS.md`](./packages/morpho-sdk/AGENTS.md#architecture).

### Modularity

- Every package has one clear job. If a package needs a paragraph to describe, split it.
- When a helper is called only to run validation, throw, or trigger another intentional side effect, add a short call-site comment explaining why its return value is unused.
- **Single source of truth** per concept: one place per ABI, one place per address registry, one place per error class. Duplication is a refactor, not a feature.
- Do not export duplicate TypeScript shapes for the same concept. If a domain interface and ABI struct are identical, export one interface and reuse it; only introduce a distinct `*Struct` type when the shapes actually differ.

### Testability

- Network, clock, randomness, signing, env, and file I/O live **only** in boundary modules. Dependencies arrive as arguments, not globals or singletons; the viem client is always passed in.
- Inner functions are deterministic and unit-testable without mocks. If a function is hard to test, its shape is wrong.

### Immutability and class APIs

- Helpers never mutate inputs; they may return an input or reuse an existing object unless their documented contract explicitly requires a fresh object.
- Do not cache promises in mutable state. Cache the resolved value if needed. The [in-flight `getRequirements()` exception](./packages/morpho-sdk/AGENTS.md#architecture) still applies.
- Do not use classes as value bags. If a type has no meaningful behavior beyond construction, copying, or a one-line conversion, model it as a `type`/`interface` and use local pure conversion where needed. Classes are for typed errors and domain objects with real behavior.
- Never `deepFreeze` a class instance. Use readonly fields/types for API intent. `deepFreeze` is reserved for function outputs that are expected to be immutable descriptors submitted onchain or signed immediately after construction.
- Prefer early returns over deep nesting — guard clauses first, happy path last.
- If a public helper would primarily return an instance of a public class, expose it as a static class method instead of a `*Utils` factory: prefer `Offer.create(...)`, `Group.create(...)`, `Tree.create(...)` over `OfferUtils.buildOffer(...)` or `OfferUtils.buildTree(...)` returning class instances.
- Class-specific methods and getters delegate to pure `*Utils` namespace functions that accept readonly plain JavaScript objects compatible with the class's public shape. `*Utils` namespaces own deterministic object-compatible behavior, validation, encoding math, and struct reshaping; they are not the primary constructor surface for a class instance.

> Applied by personas: [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md), [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) (ABI/address source of truth), [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (no input mutation), [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) (testability and promise caching), [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md) (early returns), [`skill-authoring`](./.agents/pr-review-engine/agents/skill-authoring.md) (single source of truth).

---

## 2. What does not land in a PR

A scannable list of patterns reviewers reject. Reviewers cite this section by number.

1. `any`, `@ts-ignore`, `@ts-expect-error` (without an issue link and a deletion plan), and `as unknown as` outside test files. Test files may use `as unknown as` for narrow fixtures or test-only adapters when a real object would obscure the behavior under test.
2. `throw new Error(...)` from SDK source. Every failure mode is a named, exported class.
3. `async` in actions; clocks, randomness, network reads, or signing in transaction builders. [`morpho-sdk` Action-layer purity](./packages/morpho-sdk/AGENTS.md#architecture) applies this to its Action layer.
4. Mutation of input arguments.
5. Deep imports across packages (`from "@morpho-org/foo/src/internal/..."`). Public surface is `src/index.ts`.
6. **Mock-only fork paths or fork-only mock paths.** Integration tests that exercise contract round-trips must use Anvil forks via `@morpho-org/test` — not `vi.mock`/`vi.spyOn` of viem's actions, which silently miss when the SDK uses `viem/actions` named imports. **Permitted exception**: unit tests for code that does not depend on real onchain state may inject a mocked transport via `createMockClient` from `@morpho-org/test/mock` — encoders, deserialization, validation, augmentation wiring, and shaped-response fetchers are all in scope. Code paths whose correctness depends on real onchain state — oracles, accruals, position health under live IRMs, multicall+deployless code aggregation, contract-revert behaviour — must still be exercised via Anvil forks at pinned blocks; a transport mock can fake those responses but cannot prove the path matches mainnet. The mock intercepts JSON-RPC at `client.transport`, which is the same surface `viem/actions` reads from, so it's behaviour-faithful for input/output shape. Anvil forks remain mandatory for end-to-end contract verification.
7. Edits to generated outputs (`src/api/sdk.ts`, anything under `lib/`). Edit the input (`graphql/*.gql`).
8. Framework imports (`react`, `wagmi`, `redux`, `ethers`) in core packages.
9. New runtime dependencies without a package-level reason and a written justification in the PR description.
10. PRs that ship behavior-affecting package source changes without their tests, JSDoc, and semver-relevant changeset.

> Applied by personas: [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md) (forbidden patterns 1–4, 7–10), [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md) (5 — deep cross-package imports), [`test-coverage`](./.agents/pr-review-engine/agents/test-coverage.md) (6 — mocked viem clients on RPC paths), [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (3 — signing in transaction builders), [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) (complement to rule 2 — handling discipline once a typed error is thrown; code-quality owns the rule's existence).

---

## 3. Type discipline

- Strict TypeScript, NodeNext. Hard-to-type APIs are the wrong shape — redesign before reaching for an escape hatch (§2 rule 1).
- **Discriminated unions over options bags.** The `type` tag is obvious; `switch` is exhaustive.
- `readonly` on every public field. Returned transaction, call and signature descriptors are frozen; class instances never are (§1).
- **Typed errors as public API.** One class per failure mode, exported, integrators pattern-match on it. Preserve `cause` when wrapping. Error messages read like instructions, not blame. Use this format (verbatim from `BorrowExceedsSafeLtvError`):
  ```text
  Borrow amount ${borrowAmount} exceeds safe maximum ${maxSafeBorrow} (LLTV minus buffer). Reduce borrow or increase collateral.
  ```
- Reuse SDK types (`Address`, `MarketId`, `ChainId`, `BigIntish`, `MarketParams`) instead of re-declaring at call sites.
- `bigint` for onchain quantities and WAD-scaled rates (`92_0000000000000000n`). Quote interpolated values in error messages: `expected "${expected}", got "${actual}"`.
- `as const` + `satisfies` for protocol lists and ABI literals (`BLUE_MARKET_OPERATION_TYPES = [...] as const satisfies readonly OperationType[]`).
- Internal symbols carry `@internal` JSDoc and do not participate in the stability contract.
- **Absorb fragile types.** Types at risk of upstream churn are re-declared locally rather than re-exported, so the SDK's version story stays decoupled from its dependencies.

> Applied by personas: [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md), [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md).

---

## 4. Public API & packaging

- Every public symbol is re-exported explicitly from `src/index.ts`. Nothing else is public.
- **`morpho-sdk` is the canonical consumer package.** Any PR that adds or changes a consumer-facing ABI, address, constant, entity, error, fetcher, type, or utility in `blue-sdk`, `blue-sdk-viem`, or `midnight-sdk` must audit the matching `morpho-sdk` facade subpath in the same PR. Every established facade category exposes raw dependency names through `/blue/<category>` or `/midnight/<category>`; its unprefixed counterpart uses `Blue`/`Midnight`-qualified names for protocol-specific symbols and leaves genuinely shared symbols unqualified. Deprecate legacy ambiguous names before removal, and do not expand the facade into a new upstream surface solely for parity.
- **Tree-shakeable.** ESM at source (`"type": "module"`); no top-level side effects. Every package without top-level side effects sets `"sideEffects": false` in `package.json`.
- **Dual ESM/CJS publish** from `lib/esm` and `lib/cjs`. Recommended build script: `tsc --noEmit && bun run build:cjs && bun run build:esm` (test/fixture-only packages may skip the type-check step). `publishConfig.exports` mirrors `types`, `import`, `require`. Subpath exports need both package exports and TS path mapping.
- **`viem` is the only peer dep of `morpho-sdk`.** Integrators install `morpho-sdk + viem` and they're done. Other packages in the monorepo declare their own peer deps as needed.
- **Workspace deps** use workspace ranges (`"@morpho-org/blue-sdk": "workspace:^"`), except internal `peerDependencies`. Internal peers use explicit published semver ranges (`"^6.0.0"`, not `"workspace:^"`) so Changesets does not auto-bump peer dependents. When a package is bumped, the author and reviewer must audit every package that declares it as a peer dependency, decide whether its peer range must be updated, and include explicit changesets for every affected dependent package. Do not rely on Changesets to infer peer-dependent releases.
- Framework adapters live in explicitly named packages (`*-wagmi`, `*-viem`); core packages stay framework-free.
- Don't replace a small local helper with a transitive dep just to "reuse code".

> Applied by persona: [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md).

---

## 5. Testing

- **Unit tests are colocated in every package.** Name them `*.test.ts` and place them beside the module they exercise (`foo.ts` ↔ `foo.test.ts`). A unit test for test-only support code under `test/` stays beside that support module so the helper never enters a published `src/` tree.
- **Integration and fork tests live only under `packages/<pkg>/test/`.** Name them `*.integration.test.ts`; never colocate them under `src/`, and use the singular `test/` directory rather than `tests/`. Each package's Vitest unit and fork projects must route these two sets separately.
- **Coverage commitment** (review-only — no CI threshold gate today): every exported function has a unit test; every entity fetcher has a fork-based integration test. We aim for 100% on the exported surface.
- **Property-based tests.** New and refactored property tests use `test.prop`/`it.prop` from `@fast-check/vitest` for protocol math (MathLib, share/asset conversions, accrual, liquidation, and Midnight math) and calldata builders. The suite's seed and default `numRuns` live only in `vitest.fast-check.setup.ts`; the seed changes every two days (UTC), so the suite keeps exploring new inputs. No committed per-test seeds or environment variables. To reproduce a failure, temporarily pass the printed `{ seed, path }` to the failing property locally (never commit it), then pin the counter-example with `examples`. The rotating seed runs in blocking CI, so a run that turns red only because the seed rotated is fixed the same way: pin the counter-example with `examples`; if it is an SDK divergence, also file it and keep the property as an expected failure (`test.fails.prop`), so it keeps failing after the seed rotates. Set `numRuns` per property by cost: 1,000 for pure bigint math, 200 for calldata build-and-decode, and 10–20 for fork properties against on-chain results in `*-fork` projects. Keep total property-test time to about one minute in CI. Properties encode Solidity protocol invariants (rounding direction, bounds, and formulas); track SDK divergence as a separate issue instead of bending the property.
- **Security invariants are tests.** Each invariant in [`SECURITY.md`](./SECURITY.md) has a test that fails if the invariant is removed; the `morpho-sdk` list is in [`packages/morpho-sdk/AGENTS.md`](./packages/morpho-sdk/AGENTS.md#tests).
- **Test runner:** Vitest. Fork tests use the harness from `@morpho-org/test` (`createViemTest`, `createAnvilTestClient`) and pin to a known block per chain.
- **Test structure** (target shape; adopted as new and refactored tests are written):
  ```ts
  describe("functionName", () => {
    test("default", () => { /* primary happy path */ });
    test("behavior: <specific case>", () => { /* edge case or variation */ });
    test("error: <ErrorClass>", async () => {
      await expect(fn(badInput)).rejects.toBeInstanceOf(ErrorClass);
    });
  });
  ```
- **Test isolation:** deterministic, independent. Use parameterized factories (`randomMarket({ loanToken })`) over hand-rolled fixtures. No cross-test state, no mutating shared fixtures.
- **Inline snapshots** (`toMatchInlineSnapshot`) for transaction shapes and decoded calldata, seeded as the convention adopts. Re-record only when the change in transaction shape is intended and reviewed in the same PR.
- **Errors asserted by class identity, not message string** — messages can change without notice; classes are public API.
- **Mocked viem clients** are limited to unit tests through `createMockClient` from `@morpho-org/test/mock`; §2 rule 6 sets the boundary. Pure-function tests need neither Anvil nor a viem client.
- **Shared test helpers** live in `morpho-test` and `test` — never in published runtime paths of feature packages.

> Applied by personas: [`test-coverage`](./.agents/pr-review-engine/agents/test-coverage.md) (test presence, placement, and naming), [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) (protocol invariant semantics), [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (security invariants — chainId validation, authorization, accounting).

---

## 6. Documentation

- **JSDoc is required on every exported symbol** — class, function, type, constant. Review-only today (Biome doesn't enforce); contributors and reviewing agents apply this. Internal locals and test helpers don't need JSDoc.
- **Canonical shape and copy-pasteable template:** [`docs/jsdoc-style.md`](./docs/jsdoc-style.md). Coverage burndown: `bun run jsdoc:coverage`.
- **Required tags** on exported functions and methods:
  - Short description (what it does, what it reads on-chain if anything).
  - `@param` for each parameter.
  - `@returns` describing the return shape.
  - `@throws` for each typed error class an integrator may pattern-match on.
  - One `@example` block with realistic working code: imports, client setup, the call, expected return.
- **AI-legibility is first-class.** Identical signatures across V1/V2 where protocols overlap, and deterministic outputs verifiable byte-for-byte. Protocol-specific terms (`LLTV buffer`, `wNative`, `BlueBundlesV1`, `BluePublicAllocator`, `MetaMorpho`, `Permit2`, `WAD`) live in the [`packages/morpho-sdk/AGENTS.md`](./packages/morpho-sdk/AGENTS.md) glossary.
- **Technical decisions are ADRs.** A hard-to-revert decision or a new technical standard is recorded as an Architectural Decision Record under [`docs/adrs/`](./docs/adrs/) from [`docs/templates/ADR.md`](./docs/templates/ADR.md), accepted by merging its own PR and frozen after merge; ADRs carry no Status field. Planning content (milestones, acceptance criteria, owners, file paths) lives in the Linear Technical Project Plan, not the ADR. See [`docs/DEVELOPMENT-LIFECYCLE.md`](./docs/DEVELOPMENT-LIFECYCLE.md).
- **Accepted ADRs are historical records.** Do not rewrite a record already present on the target branch to follow later code, symbol, or path changes. Keep its implementation-time names and examples intact. The only permitted edits to an accepted record are a References bullet naming its successor (`Superseded by <stem>.` or `<part> superseded by <stem>.`), its filename, or a link path whose target was renamed; a changed decision gets a new superseding ADR that lists the old record in its References. Only an ADR introduced for the current implementation may be kept in sync with that implementation before it lands.
- **TypeDoc-generated reference** published per release.
- **Feedback loop:** if the same question is asked twice, the answer goes into the JSDoc on the export it concerns, or into the relevant `AGENTS.md` when it meets the admission rule in §9.

> Applied by persona: [`documentation`](./.agents/pr-review-engine/agents/documentation.md) (also covers Markdown doc accuracy and pointer integrity across the repo, not just JSDoc).

---

## 7. Releases & versioning

For local dependency changes, use `bun run deps:add <package> [--dev]` or
`bun run deps:update [package] [--latest]` from the root. They resolve with
`--lockfile-only --ignore-scripts`, validate all locked publication timestamps,
then install the frozen lockfile. The repository's Bun security scanner also
checks resolved packages before raw `bun add`, `bun update`, or `bun install`
can install them. Use `bun run install:checked` for an existing lockfile.

Add `--workspace packages/<name>` to either dependency command to edit an existing
workspace instead of the root manifest. Outside, nested and symlinked paths are
rejected; release-age validation and the frozen install always run at root.
The tooling decision is recorded in [ADR-2026-11-18](./docs/adrs/ADR-2026-11-18-bun-package-management.md).

- **SemVer, strict.** Patch: bug fixes and internal source maintenance changes. Minor: additive surface (including a new `@throws` error class on an existing export, or a different class for an input that already failed), deprecations. Major: removed/renamed/retyped public symbols.
- **CHANGELOG via Changesets** — every semver-relevant change to published package source ships with a changeset (review-only today). JSDoc-only changes to published package source may also ship a patch changeset when maintainers want them visible in package release notes. Do not generate a changeset for repo metadata, non-API documentation-only, fixture-only, generated-output-only, or tests-only changes; those do not change the published package contract.
- **Changeset text is public.** Each changeset's summary is copied verbatim into the package's published `CHANGELOG.md`. Write it for integrators: no internal ticket keys, internal links, PR links or author credits. `public-scan` checks pending changeset text with the public tree's rules, which catch internal ticket keys and internal links; PR links and author credits are left to review.
- **Dependent package bump audit on package bumps.** Every changeset that bumps a package must be checked against downstream direct runtime `dependencies` and `peerDependencies`. Direct maintained dependents must be included in the same changeset with at least a patch bump when consumers need the dependent package's latest version to resolve the updated dependency (for example `blue-sdk` address/ABI/constant updates must patch maintained packages that depend directly on `@morpho-org/blue-sdk`, such as `morpho-sdk`). Internal peer dependency ranges are maintained manually; if a peer dependent should accept the new version or no longer accepts the old compatibility set, update its peer range and include that dependent package in the changeset with the appropriate bump.
- **`main` is always releasable.** Fork suite green per chain matrix.
- **Pin ABIs and addresses in-package.** No runtime ABI fetch; no address drift between releases.
- **4-step deprecation flow:** introduce successor → deprecate with `@deprecated` JSDoc → maintain both for one minor → remove in the next major. No silent removals. An exception to these steps is an entry in [docs/EXCEPTIONS.md](./docs/EXCEPTIONS.md) citing its ADR or maintainer approval and the exact packages, versions and symbols it covers; no break outside that scope inherits it.
- **`liquidity-sdk-viem` deprecation window.** Only the three-month source-removal wait is waived; npm deprecation notices and continued availability of published versions remain required (see [docs/EXCEPTIONS.md](./docs/EXCEPTIONS.md#liquidity-sdk-deprecation-window)).
- **Migration guides on every major**, with codemods where mechanical.
- **Experimental TransactionPlan APIs.** Only the scoped beta exports are exempt from major bumps and deprecation steps; minor changesets and stored-format guards remain required (see [docs/EXCEPTIONS.md](./docs/EXCEPTIONS.md#experimental-transactionplan-apis)).
  This includes the Blue snapshot exports: `BlueMarketSnapshot`, `BluePositionSnapshot`, `BlueSnapshotChainMismatchError`, `BlueSnapshotStateMismatchError`, and `validateBlueMarketSnapshot`.
  Blue supply exports `prepareBlueSupply` and `BlueSupplyPlanParams` are also covered.
  For Blue collateral supply, the scoped exports are `prepareBlueSupplyCollateral` and `BlueSupplyCollateralPlanParams`.
  Borrow plans also include `prepareBlueBorrow` and `BlueBorrowPlanParams`.
  It also includes `prepareBlueSupplyCollateralBorrow` and `BlueSupplyCollateralBorrowPlanParams`.
  This includes Blue repay plans: `prepareBlueRepay` and `BlueRepayPlanParams`.
  It also includes `prepareBlueWithdraw` and `BlueWithdrawPlanParams`.
  It also includes `prepareBlueWithdrawCollateral` and `BlueWithdrawCollateralPlanParams`.
  This includes `prepareBlueRepayWithdrawCollateral` and `BlueRepayWithdrawCollateralPlanParams`.
  The Blue refinance exports `prepareBlueRefinance` and `BlueRefinancePlanParams` are also covered.
- **`evm-simulation` 9.0 `simulate` retype.** Only the successor, deprecation and coexistence-minor steps are waived, for `simulate` in `@morpho-org/evm-simulation` 9.0.0: its return type, its client-first signature, and the removal of `params.chainId`, `SimulationConfig`, `ChainSimulationConfig` and `InvalidChainIdError`, plus 8.9.0's `ChainSimulationClientConfig` and `ChainSimulationConfigEntry` and 8.8.0's `findings` and `SimulationRejectedError` name; the major changeset, migration guide and dependent audit remain required (see [docs/EXCEPTIONS.md](./docs/EXCEPTIONS.md#evm-simulation-report-returning-simulate)).
- **Cantina audit on every major release**, with the public report linked from the CHANGELOG entry. Critical CVEs trigger out-of-band patches.
- **Pre-release dogfood on every minor:** at least one internal app and one external partner before the `latest` tag flips.
- **Respect Bun minimum release age when bumping releases.** Keep `minimumReleaseAge = 259200` (three days, in seconds) in `bunfig.toml` and strict pre-install validation via `scripts/check-release-age.ts --all` enabled. Prefer waiting for the configured `minimumReleaseAge` window or pinning to the latest eligible version. For `release-age-exceptions.json` and `minimumReleaseAgeExcludes`: A temporary exclusion is at most Medium/warning only when it names an exact `<package>@<version>` that resolves a critical advisory (CVSS ≥ 9.0 or GitHub critical) for a production dependency, no version that fixes the advisory has already reached the minimum age, the PR body states the advisory, severity and version publish date, removal is tracked as soon as the version reaches the minimum age, and strict age enforcement stays enabled for every other version and install path. If a fixing version has reached the minimum age, wait or pin to that eligible fix; an exclusion anyway remains High. No human approval is a review prerequisite. Any other temporary exclusion remains High; blocking these exclusions is intended. No automated check substitutes for the age window on the excluded version. Wildcard or permanent exclusions, dropping strict enforcement, skipped/failed safeguards and fail-open install paths remain High. Confirmed vulnerabilities retain their normal severity. General missing-evidence-as-uncertainty guidance still applies to other topics. Exceptions require an exact `<package>@<version>` in the root `release-age-exceptions.json` JSON array and the corresponding package name in `[install] minimumReleaseAgeExcludes` in `bunfig.toml`. Pin the fixed version and track removal of both entries. Bun uses the name entry for resolution; `scripts/check-release-age.ts` ignores that name list and waives only age for the exact JSON identity. Bare names, ranges and patterns are rejected, and missing or invalid timestamps always fail, including for exceptions.

> Applied by personas: [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md) (deprecation lifecycle), [`style-conventions`](./.agents/pr-review-engine/agents/style-conventions.md) (changeset relevance), [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) (pinned ABI/address release contract), [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) (publish-flow integrity, conditional).

---

## 8. Code style & tooling

- Bun 1.4.5 + Node ≥26. Root checks: `bun run lint` and `bun run test`.
- Knip gates unused files, dependencies, and exports in `bun run lint`; public barrel exports aren't flagged (entry files).
- Biome owns style: 2-space indent, organized imports, no unused imports or variables.
- Oxlint checks address checksums. Run `bun run lint:address --fix` to correct them.
- NodeNext module resolution; relative imports include `.js` (`export * from "./market/index.js"`).
- Type-only imports where possible (`import type { Address } from "viem"`).
- Never push a working branch with `--no-verify`. Fix what the hook flags, or report the hook if it is broken.
- Reuse semantic helpers exposed by direct dependencies instead of hand-rolling equivalents. When available, use viem's `isAddressEqual` for EVM address equality, and use `_try(accessor, ExpectedError)` for optional typed lookups. Always name the expected errors so unrelated failures propagate, and do not pass an accessor that can legitimately return `undefined` unless successful absence is explicitly tagged (for example with `null`). Lowercasing remains valid when normalization itself—not equality—is the goal, such as normalized map/set keys or deterministic output.
- One concern per PR.

> Applied by personas: [`style-conventions`](./.agents/pr-review-engine/agents/style-conventions.md) and [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) (working-branch pushes in CI, conditional).

---

## 9. Continuous improvement

- Existing packages may predate these rules; do not widen divergence when touching them.
- Move touched code toward the nearest applicable `AGENTS.md` guidance, even when a full cleanup is out of scope.
- **On refactor, adopt the convention.** Refactors and rewrites are the migration path — don't carry legacy patterns (misplaced tests, untyped errors, missing JSDoc, framework leakage) forward into refactored code.
- If a package can't yet meet an applicable rule, record the exception and why in [docs/EXCEPTIONS.md](./docs/EXCEPTIONS.md), and point to it from the nearest `AGENTS.md`.
- **What belongs in an `AGENTS.md`.** Add a rule only if it applies to future changes beyond the PR that prompted it, and put it in the narrowest file that covers its scope: this file for every package, a package file for that package. A finding that concerns one PR is settled in that PR's code or review thread, not by a new rule. A scoped waiver goes in [docs/EXCEPTIONS.md](./docs/EXCEPTIONS.md). A rule added or loosened so that a finding about a PR's other changes goes away ships in its own PR, not in that PR (§10, "Judge the effect, not the framing"). A PR that changes rules still corrects its own rule text and updates the rule's mirrors in the same PR. Descriptions of how a package is built are not rules and change with the code they describe.

---

## 10. Review automation & CI/release security

Local `/review-pr-{gh,local}` commands fan out to the personas at [`.agents/pr-review-engine/agents/`](./.agents/pr-review-engine/agents/); the automated PR reviewer is described in [`.github/workflows/AGENTS.md`](./.github/workflows/AGENTS.md). This section is the canonical inventory of those personas and the source of truth for the CI/release rules `ci-release-security` anchors on and the review-integrity rules that `web3-security`, `silent-failure-hunter` and `ci-release-security` apply.

### Orchestration

| File | Role |
|---|---|
| [`.agents/commands/review-pr-{gh,local}.md`](./.agents/commands/) + [`fix-pr.md`](./.agents/commands/fix-pr.md) | Caller-side commands (local PR / pre-PR terminal / fix). Each parses args, resolves branches, then delegates Steps 3–6 to the engine. Symlinked into `.claude/commands/`. |
| [`.agents/pr-review-engine/SKILL.md`](./.agents/pr-review-engine/SKILL.md) | Shared review **engine** (Steps 3–6) — reads `<PROJECT_CONTEXT>`, computes conditional flags, fans out the agents, then aggregates / dedups / snaps findings to diff lines. Encodes no rule; orchestrates only. Not invocable directly (not symlinked into `.claude/commands/`). |
| [`.agents/pr-review-engine/scripts/`](./.agents/pr-review-engine/scripts/) | Deterministic helpers run by the engine / callers: `build-changed-lines`, `validate-findings`, `findings-ledger` (stateful ledger + idempotency cache), `review-scope`. Unit-tested under the `agents-engine` Vitest project. |
| [`.agents/pr-review-engine/references/`](./.agents/pr-review-engine/references/) | Shared rubric content cited by agents (changed-lines, scope-filter, calibration, secrets, injection, github-actions, skill-authoring). |

### Persona inventory

Baseline personas (always fire):

| Persona | Anchors | Focus |
|---|---|---|
| [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md) | §1 (early returns), §2, §3 | Type safety, code smells, naming, cross-file impact on SDK consumers, security primitives. |
| [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md) | §1, [`morpho-sdk` Architecture](./packages/morpho-sdk/AGENTS.md#architecture) (layering), §2 (rule 5), §3, §4, §7 | Package boundaries, public surface and deprecation lifecycle, NodeNext import discipline, boundary-level type discipline. |
| [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) | §1, §5, §7 | Morpho protocol semantics, ABI/address source-of-truth drift, operation routing, accounting/share-price/LLTV invariants. |
| [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) | [`morpho-sdk` Architecture](./packages/morpho-sdk/AGENTS.md#architecture) (Action layer), §1, §2, §5 (security invariants), §10 (review integrity rules) | Contract interactions, transaction params, permit flows, race conditions. Severity defaults to critical/high. |
| [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) | §1 (promise caching), §2 (handling depth for rule 2 — see persona body), §10 (review integrity rules) | Swallowed errors, cached promises, missing error states, dead code paths. |
| [`style-conventions`](./.agents/pr-review-engine/agents/style-conventions.md) | §7, §8 | Biome compliance, import discipline, changeset relevance. |
| [`documentation`](./.agents/pr-review-engine/agents/documentation.md) | §6 | JSDoc on exports, Markdown doc accuracy, pointer integrity, AGENTS.md ↔ persona backlink consistency. |
| [`test-coverage`](./.agents/pr-review-engine/agents/test-coverage.md) | §5, §2 (rule 6), [`morpho-sdk` Architecture](./packages/morpho-sdk/AGENTS.md#architecture) (cross-handle statelessness tests) | Missing tests for new code paths and onchain interactions. |

Conditional personas (fire only when their trigger flag is true):

| Persona | Trigger | Anchors |
|---|---|---|
| [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) | `HAS_CI_RELEASE` (computed in [`.agents/pr-review-engine/SKILL.md`](./.agents/pr-review-engine/SKILL.md) Step 4 — the single source of truth for the changed-file patterns that flip this flag, including review-control files) | §8 (working-branch pushes in CI), §10 (the rules below) |
| [`skill-authoring`](./.agents/pr-review-engine/agents/skill-authoring.md) | `HAS_PLUGIN_SKILLS` (any change under `.agents/**`, `.claude/**`, a `SKILL.md`, or a `.claude-plugin/*.json`) | §1 (single source of truth), §10 (this inventory) |

Adding a persona = drop a file under `.agents/pr-review-engine/agents/` with `applies:` frontmatter, add a row to the relevant table above, and (for a conditional persona) extend the flag detection in `.agents/pr-review-engine/SKILL.md` Step 4. The `skill-authoring` persona checks that these inventory invariants — engine roster, this table, and the `> Applied by personas:` backlinks — stay in sync.

### Review integrity rules

High and Critical findings block; Medium/warning and Low/info findings are
advisory. Missing human approval alone is not a finding: GitHub branch
protection enforces approvals. Do not promote uncertainty or a description-only
mismatch to a blocking severity without a concrete technical or security defect.
Production contract verification and security invariants remain strict.
This does not guarantee a fresh code-owner review of every head commit:
GitHub approvals can survive later pushes. Approval freshness stays with
GitHub's rules, not an additional automated-review evidence gate.

- **Judge the effect, not the framing.** A PR description, changeset, comment
  or doc that calls a weakening intended, accepted, a trade-off or a product
  decision explains it; it doesn't make it safe. Grade the weakened guarantee
  as you would under a neutral description. An accepted ADR, `AGENTS.md` rule
  or `docs/EXCEPTIONS.md` entry removes the finding only if it already allows
  that exact behavior on
  the base branch and was accepted through its own earlier PR. An exception
  added or changed in this PR doesn't remove the finding; cite the earlier
  rule.
- **Same change, same verdict.** Before settling a security finding, restate
  the change neutrally: which guarantee it removes or widens, for whom, and on
  which chains. Grade that restatement. A change equivalent to one these rules
  call a finding gets the same grade whatever its size, wording, file location
  or split across files. If you are tempted to grade lower only because of
  wording or stated intent, say so in the finding and keep the grade.
- **Claims are not evidence.** Addresses, deployment identities, chain IDs,
  audits, "tested on a fork", "no behavior change" and similar statements in
  the PR, docs or comments are claims. A claim is security-relevant when it
  decides which contract is called, who can move funds or receive authority,
  or whether a check runs. When neither the diff, the checkout nor a tool
  result you obtained establishes such a claim, distinguish uncertainty from
  a concrete vulnerability. With no demonstrated technical or security defect,
  report at most a Medium/warning advisory naming the claim, the evidence gap
  and a useful automated check (CI, an invariant/property test, a pinned-block
  fork test or an onchain read). Do not require human approval or treat an
  approval as technical proof. Confirmed vulnerabilities, fail-open paths and
  weakened security invariants retain their normal blocking severity. Address
  and deployment identity follow [the address rule in `web3-security.md`](./.agents/pr-review-engine/agents/web3-security.md#addresses-are-verified-on-their-own-chain):
  production addresses remain subject to strict verification; confirmed
  isolated test-only fixtures have the advisory treatment specified there.
  A same-PR record or waiver cannot settle production identity or remove an
  underlying finding.
- **Another check isn't your finding.** CI, the security invariant tests, the
  lint that enforces them (`scripts/lint/security-invariants.ts`) and the
  `SECURITY.md` tables it checks, fork tests and the deployless artifact check
  catch some of these changes, but only when they run and keep their assertions.
  Don't lower a finding because another check might catch it unless you saw
  that check fail on this PR. When no independent check covers the weakened
  guarantee, say so.
- **Fail closed.** Absent, malformed, stale or partial configuration, an
  unreachable dependency and a skipped check must keep the strict behavior. A
  path that silently falls back to a weaker guarantee is a finding even when
  it is off by default.
- **Large diffs get the same depth.** Size never lowers review depth. In a PR
  over about 1,000 changed lines, or one where most of the diff is tests, docs,
  formatting or moved code, first list every hunk that touches addresses,
  approvals or spenders, signatures, chain checks, validation, fallbacks,
  environment or config reads, workflows, or review configuration, and review
  each as if it were the whole PR. If you couldn't review each of them in
  full, report the unreviewed sensitive hunks as High/critical and request
  changes asking for the PR to be split; don't approve. This incomplete-review
  gate is distinct from an unverifiable claim in otherwise reviewed code.

> Applied by personas: [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (consistent verdicts, independent-check evidence and review depth), [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) (fail-closed error paths), and [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) (framing and evidence rules on CI/release diffs, conditional).

### CI / release security rules (anchors `ci-release-security`)

Every workflow install must first run `node scripts/check-release-age.ts --all` against the checked-out tree, using Node built-ins only. This validates every registry identity, even on release branches whose merge base already contains the lockfile. Locally, use `bun run install:checked` after lockfile changes; it checks first, then performs a frozen install. The security scanner configured in `bunfig.toml` applies the same publication policy to Bun's resolved packages before installation, without depending on lifecycle hooks.

The release-age workflow-authority paths include `scripts/check-release-age.ts`, `scripts/check-release-age.test.ts`, `scripts/release-age-scanner.ts`, `scripts/release-age-scanner.test.ts`, `scripts/update-dependencies.ts`, `scripts/update-dependencies.test.ts`, and `release-age-exceptions.json`.

These are the rules `ci-release-security` enforces. They live here as source of truth; the persona references this section by anchor. When a rule changes here, update the persona body to match.

- **CI logic is tested code.** Any `run:` block that derives a decision or a value from data — parsing API responses, filtering or counting records, computing step outputs, deciding pass/fail — lives in a TypeScript script under `scripts/ci/`, or `scripts/publish/` for npm publish checks the public repository also runs (run as `node <script>.ts`) with colocated `*.test.ts` in the `scripts` project, and the workflow step just invokes it. Inline `jq`/`awk`/shell pipelines encoding such logic are **high**: they run untested until the workflow fires in production and their failures are invisible in review. Exempt: linear setup sequences (install, `sysctl`, `cp`), a single command with a static error message on failure, and marshalling static workflow inputs into command arguments — no data is interpreted, so there is nothing to unit-test (see `scripts/publish/watch-npm-releases.ts` for the pattern: `env`/`fetchImpl` injected, version selection exported and unit-tested). Steps that must run against the PR head execute the trusted default-branch copy of the script, never the workspace one. The one named exception is the inline checks in the `release` job of `public/.github/workflows/release.yml` (each `release-plan` row, the author of an existing GitHub Release, and an existing tag's commit), which holds `contents: write` and must run no repository code; see [`.github/workflows/AGENTS.md`](./.github/workflows/AGENTS.md).
- **Workflow injection** (CRITICAL). Never interpolate attacker-controllable GitHub context (`${{ github.event.* }}`, `${{ github.head_ref }}`, comment bodies, branch names) directly into `run:` blocks, `shell:` invocations, or third-party-action arguments. Bind to an `env:` first, then reference `$VAR` in the shell so GitHub's redaction can still apply and shell expansion can't reinterpret the value.
- **`pull_request_target` + PR-head checkout is forbidden** unless the workflow demonstrably never runs the checked-out code (no install, no test, no script). The combination grants attacker code write-scoped repo credentials.
- **ACL-gated comment triggers.** `issue_comment` / `pull_request_review_comment` workflows must gate on `github.event.comment.author_association` (`OWNER`, `MEMBER`, or `COLLABORATOR`) before acting on comment text.
- **Action pinning.** Third-party `uses:` lines pin to a full commit SHA with the human-readable tag in a trailing comment: `uses: foo/bar@<40-char-sha>  # v1.2.3`. First-party `actions/*` and `github/*` may use tagged versions because Morpho's shared dependency automations review and bump them; Dependabot version updates are not enabled in this repo. Newly added actions from publishers the org has not used before must surface the publisher name in the review comment so a maintainer can confirm review.
- **`permissions:` block required** on every workflow. Default `contents: read`. Job-level scopes where they differ. `id-token: write` only on the `publish` job of the public `release.yml`. `secrets: inherit` passed to reusable workflows is forbidden — list secrets explicitly.
- **Private workflow exceptions.** In the source repository with a separate `public/` export tree, an exact exception in `.github/workflows/AGENTS.md` may allow a reusable call from a private workflow under `.github/workflows/` to use a verified upstream-main commit in place of the release comment and grant the documented job-level identity-token ceiling. Public workflows follow the rules above both under `public/` and after export.
- **Secret exposure.** Secrets must be `env:`-bound and referenced as `$VAR` inside scripts; never interpolated into the `run:` string directly. Secrets passed to third-party actions require those actions to be SHA-pinned.
- **Secret scoping & branch-gating.** Each workflow secret's intended reach (repo-level/every-branch vs branch-gated vs OIDC/`environment`-gated) and sensitivity are recorded in [`.github/workflows/AGENTS.md`](./.github/workflows/AGENTS.md); a new secret name added to a workflow must gain a row there in the same PR. Widening a secret's reachable scope is a finding: removing or loosening the `if: github.ref_name == 'main' || github.ref_name == 'next'` gate on the token jobs in `version-pr.yml` and `next-sync.yml`, consuming `VERSION_APP_*` outside their `version-app` token jobs (limited to `main`/`next`) or adding that environment to any job other than those two token jobs, moving a write/publish/signing secret into the `test` job, or exposing any secret to a fork-accessible trigger is **high** — **critical** for the write-token or publish path. The two gated callers in `push.yml` must forward exactly `VERSION_APP_ID` and `VERSION_APP_PRIVATE_KEY` to the reusable workflows' optional secret declarations, including after repository copies are removed; GitHub gives the token jobs' environment values precedence. Repository copies remain only through the runbook's first successful live run, then an admin removes them and verifies another run without fallback. The low-sensitivity, write-access-only `ERPC_SECRET` remains repo-level, but the `test` jobs in `push.yml` and `nightly.yml` exclude `fork/**` re-pushes. Those heads run the same secret-free unit projects through `fork-unit` (`fork: false`, no secrets), including `INV-01`–`INV-07`. Flag regressions of these gates or the unit coverage, not the repo-level baseline itself.
- **Publish-flow integrity.** Only the public `.github/workflows/release.yml` (authored under `public/` in the source repository) publishes and creates package tags or GitHub Releases. A second publish, tag, or release path, or `id-token: write` outside its `publish` job and an exact private exception under the rule above, is **critical**. `npm publish` / `bun publish` must use `--provenance` (or the Changesets provenance-aware path). Auth via org-scoped `NODE_AUTH_TOKEN`, never a personal access token. Tag-scope changes (e.g. `next` → `latest`) require human review of the release-flow change. The `npm` environment must retain its deployment branch restrictions and disabled administrator bypass; required reviewers are optional for both `main` and `next`. Removing `--provenance` is a downgrade — flag at minimum **medium**, **high** for runtime/peer-surface packages.
- **Artifact identity: ask the consumer, don't emulate it** (path-injection defense). When a privileged job checks an artifact produced by an unprivileged job (e.g. a `.tgz` from the pack job), the value it validates must be read through the *same code path the consumer will use*. For npm tarballs that means `pacote.manifest("file:<tgz>", { fullMetadata: true, fullReadJson: true })` from the same checksum-pinned npm distribution used by `npm publish` (`scripts/publish/read-tarball-identity.ts`) — the exact call `npm publish` makes — never a literal `tar -x package/package.json` or a `tar -t | grep` pass, and never a hand-rolled tar/PAX/path parser that *predicts* what node-tar will do. Archive entries such as `package/\./package.json`, `./package/package.json`, or a second root (`zzz/package.json`) are normalized differently by GNU tar and node-tar, so any check that reads the archive with a different tool than the consumer can be made to see a benign manifest while npm publishes a malicious one. Cheap structural checks with GNU tar (canonical paths, single `package/` root, regular files only) are fine as defense in depth but never as the identity source of truth. Reviewers flag new archive/path-normalization logic under `scripts/ci/` or `scripts/publish/` as **high**: the fix is to reuse the toolchain's own reader, not to extend the emulation. The one sanctioned normalization is `scripts/publish/verify-tarball-collisions.ts`, which lists entries with npm's bundled node-tar (`strict: true`) and rejects entries a case-insensitive/Windows consumer *filesystem* would fold together (case, `\`, `.` segments, trailing dots/spaces, `~`, non-ASCII, reserved names) — it models the consumer's filesystem, never the archive format. It also models pacote's `.gitignore` → `.npmignore` rename during extraction. The literal `package/package.json` may still be *validated* (e.g. the `publishConfig` allowlist in `scripts/publish/verify-tarball-manifest.ts`) as long as the workflow asserts its `name@version` equals the pacote-resolved identity, which proves the validated manifest is the one npm publishes.
- **Release-commit signing & write-token hardening.** Release commits and annotated package tags must be created with a valid signed identity — prefer GitHub's `createCommitOnBranch` GraphQL mutation (produces GitHub-signed commits) over local `git commit` + push from a workflow. Write-scoped tokens must only be minted **after** one of these boundaries is in place: (a) same-job hardening that verifies the checksum and `$PATH` of any trusted release helper the post-token step will execute, truncates `$GITHUB_ENV` and `$GITHUB_PATH` so inherited state from earlier steps cannot influence the privileged step, and either confirms `.git/hooks/` contains only `.sample` files or forces hooks off for privileged git invocations (`core.hooksPath=/dev/null`, plus `--no-verify` on pushes); or (b) a split-job boundary where the privileged job fresh-checks out `github.sha`, consumes only a data artifact from the unprivileged job, validates that artifact with trusted code before minting the token, and confirms `.git/hooks/` contains only `.sample` files. Any enabled content under `.git/hooks/` is a hook-poisoning footgun and must be rejected or bypassed by trusted hook-disabling config. For same-job hardening, forcing the trusted `$PATH` and an explicit expected `RELEASE_BRANCH` on the write-token step is required. Loss of the applicable guards on an existing release workflow is **critical**.
- **Changesets / release-bot wiring.** Review `.changeset/config.json` changes (fixed, linked, baseBranch, commit) for concrete versioning or publishing defects; missing human approval is not a finding. New release workflows or release-bot actions require pinned SHAs and explicit `permissions:`. Removing a previously-required check from a release workflow's `needs:` is **high**.
- **Lockfile drift.** A `bun.lock` change without a corresponding `package.json` change is acceptable for devDependency-only resolution drift when the existing manifest range already admits the new version. Flag lockfile-only changes that alter direct runtime `dependencies` or `peerDependencies`, move a dev dependency outside its declared range, change install settings, or introduce security-relevant package metadata; runtime/peer dependency changes require a manifest change plus package-version/changeset audit.
- **Dependency hygiene.** New deps in `dependencies` or `peerDependencies` of a published package default to **high** for review. Flag unpinned semver ranges (`^`/`~`) on runtime deps, names that resemble typosquats of known packages, and deps whose registry metadata declares `postinstall` / `preinstall` / `install` scripts.
- **`.npmrc` hardening.** `always-auth=true` or `_authToken=` committed to the repo is **critical** — credential leak. For non-`registry.npmjs.org` `registry=` or `@scope:registry=` lines, check scope, transport, credential handling and dependency-confusion or package-substitution risk. A non-default URL alone is not a finding or an approval prerequisite. Unverified trust without a concrete defect is at most Medium/warning.
- **Workspace install behavior.** Changes to `install.peer` in `bunfig.toml` or equivalent peer-install/validation settings are **medium** — surface the impact on consumer install behavior in the review comment.
- **Bun minimum-release-age bypasses.** Apply §7 to `release-age-exceptions.json` and `minimumReleaseAgeExcludes` and equivalent bypasses in the root exception list or `bunfig.toml`. A temporary exclusion is at most Medium/warning only when it names an exact `<package>@<version>` that resolves a critical advisory (CVSS ≥ 9.0 or GitHub critical) for a production dependency, no version that fixes the advisory has already reached the minimum age, the PR body states the advisory, severity and version publish date, removal is tracked as soon as the version reaches the minimum age, and strict age enforcement stays enabled for every other version and install path. If a fixing version has reached the minimum age, wait or pin to that eligible fix; an exclusion anyway remains High. No human approval is a review prerequisite. Any other temporary exclusion remains High; blocking these exclusions is intended. No automated check substitutes for the age window on the excluded version. Wildcard or permanent exclusions, dropping strict enforcement, skipped/failed safeguards and fail-open install paths remain High. Confirmed vulnerabilities retain their normal severity. General missing-evidence-as-uncertainty guidance still applies to other topics. The required `public-scan / Generate and scan the public tree` check runs `scripts/check-release-age.ts`; disabling or weakening it or lowering `minimumReleaseAge` remains High.

> Applied by personas: [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) (the CI / release security rules above) and [`skill-authoring`](./.agents/pr-review-engine/agents/skill-authoring.md) (the persona / orchestration inventory invariants in this section).

---

## Details for shared skills

- Test command: `bun run test run --project <name>` for a single package (project names in `vitest.config.ts`; `bun run test` runs the full vitest suite). Go through the `test` script, not bare `vitest`: it wraps vitest in `dotenv --`, which fork projects need for `ERPC_SECRET`.
- Checks: `bun run lint` (Biome `check` plus jsdoc-coverage, address, security-invariants, script-typecheck and knip gates) and `bun run build` (recursive `tsc` build of all packages).
- Knowledge homes: [`MISSION.md`](./MISSION.md) for principles, this file for engineering rules, [`docs/EXCEPTIONS.md`](./docs/EXCEPTIONS.md) for scoped or temporary rule waivers, [`docs/adrs/`](./docs/adrs/) for frozen decision records, [`docs/jsdoc-style.md`](./docs/jsdoc-style.md) for JSDoc style, and per-package `AGENTS.md` files for package rules and glossaries.
- Automated reviewer: see [the workflow guidance](./.github/workflows/AGENTS.md#automated-pr-review), which is not part of the public snapshot. Locally, `/review-pr-{gh,local}` runs the in-repo review engine.
- Release policy: Changesets — every semver-relevant change to published package source ships a changeset; merging to `main`/`next` refreshes a release PR. Merging it on `main` syncs a public snapshot to `morpho-org/sdks`, whose `release.yml` publishes to npm (see §7, [`docs/release/public-repo-setup.md`](./docs/release/public-repo-setup.md) and [`docs/adrs/ADR-2026-05-12-release-pr-publish-on-push.md`](./docs/adrs/ADR-2026-05-12-release-pr-publish-on-push.md)).

Retired in-repo workflows — use the shared skills from morpho-org/internal-skills instead:
decisions: `work-loop:write-adr`; project plans: `work-loop:write-plan`; tickets from a plan:
`work-loop:extract-plan`; retro: `work-loop:reflect`.

# Engineering Rules

> Mission, scope, and values: see [`MISSION.md`](./MISSION.md). The rules below are how we build it.

`CLAUDE.md` is a symlink to `AGENTS.md` at every level — same content, two filenames so any agent finds it. Per-package `AGENTS.md` files refine these rules for a specific package; they may add detail but **must not contradict this file**. When in doubt, the root wins.

Every PR is measured against the rules below. A change that violates an architectural principle doesn't land — we question the change before we question the principle.

> **Enforcement note.** Some rules below are enforced by tooling today (Biome formatter, fork harness in `@morpho-org/test`, Changesets generation). Most are **review-time conventions** that humans and reviewing agents apply: JSDoc on every export, layered-import bans, the §2 forbidden-patterns list (Biome's `noExplicitAny` is warn-level, `noParameterAssign` is disabled, and there's no rule banning `as unknown as` / `@ts-ignore` / async-in-actions / framework imports / mocked viem clients on RPC paths), changeset-gates-CI, full coverage thresholds. Where a rule isn't backed by an automated check, treat it as binding regardless — wiring CI gates is tracked separately.

> **Review personas.** The review-time conventions above are applied at PR review by specialized personas under [`.agents/pr-review-engine/agents/`](./.agents/pr-review-engine/agents/), invoked by the `/pr-review-{ci,gh,local}` slash commands. See [§10](#10-review-automation--cirelease-security) for the full inventory and the CI/release rules they anchor. When a rule below changes, the matching persona's bullet must change with it — the backlinks on each section name the personas to update.

---

## 1. Architecture

The three pillars: **layering, modularity, testability**. Everything else (types, API, tests, docs) flows from getting these right.

### Layering: one direction, no exceptions

`Client → Entity → Action`. Dependencies point one way. Lower layers never reach back into higher ones.

| Layer | Reads state? | Encodes calldata? | Async? | Returns |
| --- | --- | --- | --- | --- |
| **Client** | no | no | no | factory for entities |
| **Entity** | yes (RPC) | no | yes | lazy `{ buildTx, getRequirements }` |
| **Action** | no | yes | **no** | deep-frozen `Transaction` |
| **Helpers** | no | encode-only helpers (ABI-only); validators and constants are pure | no | new objects |

Cross-layer leaks (entities encoding calldata, actions reading state, helpers depending on entities) are an API design failure, not an implementation detail. Redesign the boundary; do not add a shortcut.

### Modularity: one reason to exist

- Every package has one clear job. If a package needs a paragraph to describe, split it.
- Every module has one responsibility. Files grow by *adding* exports of the same kind, never by stretching scope.
- Do not extract a local, non-exported helper unless it has at least three call sites. Inline one-off and two-use helpers.
- When a helper is called only to run validation, throw, or trigger another intentional side effect, add a short call-site comment explaining why its return value is unused.
- **Single source of truth** per concept: one place per ABI, one place per address registry, one place per error class. Duplication is a refactor, not a feature.
- Do not export duplicate TypeScript shapes for the same concept. If a domain interface and ABI struct are identical, export one interface and reuse it; only introduce a distinct `*Struct` type when the shapes actually differ.
- Framework adapters live in explicitly named packages (`*-wagmi`, `*-viem`). Core packages stay framework-free.
- Public API = barrel re-exports from `src/index.ts`. No deep imports across packages, ever.

### Testability: pure cores, I/O at the edge

- Network, clock, randomness, signing, env, and file I/O live **only** in boundary modules.
- Inner functions are deterministic and unit-testable without mocks. If a function is hard to test, its shape is wrong.
- Dependency injection through arguments, not globals or singletons. The viem client is always passed in.
- "Pure where possible" is a design rule, not a stylistic preference — every pure function we write is one fewer function we have to fork-test.

### Stateless, immutable, composable

- `morphoViemExtension()` rides on top of a viem client the integrator owns, exposing a stateless `morpho` namespace under `client.morpho` plus readonly options. No `init()`, no cache, no warm-up — those couple us to a host runtime and break statelessness.
- Every returned `Transaction` is `deepFreeze`d. Public fields are `readonly`. Helpers return new objects, never mutate inputs.
- Do not use classes as value bags. If a type has no meaningful behavior beyond construction, copying, or a one-line conversion, model it as a `type`/`interface` and use local pure conversion where needed. Classes are for typed errors and domain objects with real behavior.
- Never `deepFreeze` a class instance. Use readonly fields/types for API intent. `deepFreeze` is reserved for function outputs that are expected to be immutable descriptors submitted onchain or signed immediately after construction.
- Small primitives that combine. No kitchen-sink helpers; no boolean-prop explosions.
- Prefer early returns over deep nesting — guard clauses first, happy path last.

### Class APIs over utility factories

- If a public helper would primarily return an instance of a public class, expose it as a static class method instead of a `*Utils` factory: prefer `Offer.create(...)`, `Group.create(...)`, `Tree.create(...)` over `OfferUtils.buildOffer(...)` or `OfferUtils.buildTree(...)` returning class instances.
- Class-specific methods and getters delegate to pure `*Utils` namespace functions that accept readonly plain JavaScript objects compatible with the class's public shape. This keeps the user-facing API composable and class-based while preserving broad compatibility for object-first integrations.
- `*Utils` namespaces own deterministic object-compatible behavior, validation, encoding math, and struct reshaping. They should not be the primary user-facing constructor surface for a class instance.

> Applied by personas: [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md), [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) (protocol routing + ABI/address source of truth), [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (Action-layer purity), [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) (testability).

---

## 2. What does not land in a PR

A scannable list of patterns reviewers reject. Most are review-only today (per the Enforcement note); treat them as binding regardless. Reviewers cite this section by number.

1. `any`, `@ts-ignore`, `@ts-expect-error` (without an issue link and a deletion plan), and `as unknown as` outside test files. Test files may use `as unknown as` for narrow fixtures or test-only adapters when a real object would obscure the behavior under test.
2. `throw new Error(...)` from SDK source. Every failure mode is a named, exported class.
3. `async` in actions; clocks, randomness, network reads, or signing in transaction builders.
4. Mutation of input arguments.
5. Deep imports across packages (`from "@morpho-org/foo/src/internal/..."`). Public surface is `src/index.ts`.
6. **Mock-only fork paths or fork-only mock paths.** Integration tests that exercise contract round-trips must use Anvil forks via `@morpho-org/test` — not `vi.mock`/`vi.spyOn` of viem's actions, which silently miss when the SDK uses `viem/actions` named imports. **Permitted exception**: unit tests for code that does not depend on real onchain state may inject a mocked transport via `createMockClient` from `@morpho-org/test/mock` — encoders, deserialization, validation, augmentation wiring, and shaped-response fetchers are all in scope. Code paths whose correctness depends on real onchain state — oracles, accruals, position health under live IRMs, multicall+deployless code aggregation, contract-revert behaviour — must still be exercised via Anvil forks at pinned blocks; a transport mock can fake those responses but cannot prove the path matches mainnet. The mock intercepts JSON-RPC at `client.transport`, which is the same surface `viem/actions` reads from, so it's behaviour-faithful for input/output shape. Anvil forks remain mandatory for end-to-end contract verification.
7. Edits to generated outputs (`src/api/sdk.ts`, anything under `lib/`). Edit the input.
8. Framework imports (`react`, `wagmi`, `redux`, `ethers`) in core packages.
9. New runtime dependencies without a package-level reason and a written justification in the PR description.
10. PRs that ship behavior-affecting package source changes without their tests, JSDoc, and semver-relevant changeset.

> Applied by personas: [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md) (forbidden patterns 1–4, 7–10), [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md) (5 — deep cross-package imports), [`test-coverage`](./.agents/pr-review-engine/agents/test-coverage.md) (6 — mocked viem clients on RPC paths), [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (3 — signing in transaction builders), [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) (complement to rule 2 — handling discipline once a typed error is thrown; code-quality owns the rule's existence).

---

## 3. Type discipline

- Strict TypeScript, NodeNext, zero `any`. Hard-to-type APIs are the wrong shape — redesign before reaching for an escape hatch.
- **Discriminated unions over options bags.** The `type` tag is obvious; `switch` is exhaustive.
- `readonly` on every public field. Frozen outputs.
- **Typed errors as public API.** One class per failure mode, exported, integrators pattern-match on it. Preserve `cause` when wrapping. Error messages read like instructions, not blame. Use this format (verbatim from `BorrowExceedsSafeLtvError`):
  ```text
  Borrow amount ${borrowAmount} exceeds safe maximum ${maxSafeBorrow} (LLTV minus buffer). Reduce borrow or increase collateral.
  ```
- Reuse SDK types (`Address`, `MarketId`, `ChainId`, `BigIntish`, `MarketParams`) instead of re-declaring at call sites.
- `bigint` for onchain quantities and WAD-scaled rates (`92_0000000000000000n`). Quote interpolated values in error messages: `expected "${expected}", got "${actual}"`.
- `as const` + `satisfies` for protocol lists and ABI literals (`BLUE_OPERATIONS as const`).
- Internal symbols carry `@internal` JSDoc and do not participate in the stability contract.
- **Absorb fragile types.** Types at risk of upstream churn are re-declared locally rather than re-exported, so the SDK's version story stays decoupled from its dependencies.

> Applied by personas: [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md), [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md).

---

## 4. Public API & packaging

- Every public symbol is re-exported explicitly from `src/index.ts`. Nothing else is public.
- **`morpho-sdk` is the canonical consumer package.** Any PR that adds or changes a consumer-facing ABI, address, constant, entity, error, fetcher, type, or utility in `blue-sdk`, `blue-sdk-viem`, or `midnight-sdk` must audit the matching `morpho-sdk` facade subpath in the same PR. Every established facade category exposes raw dependency names through `/blue/<category>` or `/midnight/<category>`; its unprefixed counterpart uses `Blue`/`Midnight`-qualified names for protocol-specific symbols and leaves genuinely shared symbols unqualified. Deprecate legacy ambiguous names before removal, and do not expand the facade into a new upstream surface solely for parity.
- **Tree-shakeable.** ESM at source (`"type": "module"`); no top-level side effects. Every package without top-level side effects sets `"sideEffects": false` in `package.json`.
- **Dual ESM/CJS publish** from `lib/esm` and `lib/cjs`. Recommended build script: `tsc --noEmit && pnpm build:cjs && pnpm build:esm` (test/fixture-only packages may skip the type-check step). `publishConfig.exports` mirrors `types`, `import`, `require`. Subpath exports need both package exports and TS path mapping.
- **`viem` is the only peer dep of `morpho-sdk`.** Integrators install `morpho-sdk + viem` and they're done. Other packages in the monorepo declare their own peer deps as needed.
- **Workspace deps** use workspace ranges (`"@morpho-org/blue-sdk": "workspace:^"`), except internal `peerDependencies`. Internal peers use explicit published semver ranges (`"^6.0.0"`, not `"workspace:^"`) so Changesets does not auto-bump peer dependents. When a package is bumped, the author and reviewer must audit every package that declares it as a peer dependency, decide whether its peer range must be updated, and include explicit changesets for every affected dependent package. Do not rely on Changesets to infer peer-dependent releases.
- Each package has one reason to exist (see §1 Modularity). Framework adapters never live in core SDK packages.
- Don't replace a small local helper with a transitive dep just to "reuse code".

> Applied by persona: [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md).

---

## 5. Testing

- **Unit tests are colocated in every package.** Name them `*.test.ts` and place them beside the module they exercise (`foo.ts` ↔ `foo.test.ts`). A unit test for test-only support code under `test/` stays beside that support module so the helper never enters a published `src/` tree.
- **Integration and fork tests live only under `packages/<pkg>/test/`.** Name them `*.integration.test.ts`; never colocate them under `src/`, and use the singular `test/` directory rather than `tests/`. Each package's Vitest unit and fork projects must route these two sets separately.
- **Coverage commitment** (review-only — no CI threshold gate today): every exported function has a unit test; every entity fetcher has a fork-based integration test. We aim for 100% on the exported surface.
- **Property-based tests on calldata encoders.** `fast-check` is the recommended tool, seeded as the convention adopts. Use it for any encoder whose input space is enumerable from primitives — bigints, addresses, tagged unions, fixed-length tuples.
- **Security invariants are tests.** For each of: deposit routing, inflation-attack guard, LLTV buffer, `chainId` validation, authorization, and accounting — write a test that fails if the invariant is removed.
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
- **Mocked viem clients are limited to unit tests via the transport boundary.** Integration / fork tests of contract round-trips use Anvil forks at pinned blocks. Pure-function tests need neither Anvil nor a viem client. Unit tests that need a viem `Client` shape for code that internally calls `viem/actions` (`readContract`, `getChainId`, …) may use `createMockClient` from `@morpho-org/test/mock`, which installs a `vi.fn`-backed `custom()` transport — the same surface `viem/actions` resolves through, so the mock is behaviour-faithful. Do **not** stub `client.readContract` directly with `vi.spyOn`; the actions resolve through `client.transport` and the spy will silently no-op.
- **Shared test helpers** live in `morpho-test` and `test` — never in published runtime paths of feature packages.

> Applied by personas: [`test-coverage`](./.agents/pr-review-engine/agents/test-coverage.md) (test presence, placement, and naming), [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) (protocol invariant semantics), [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) (security invariants — chainId validation, authorization, accounting).

---

## 6. Documentation

- **JSDoc is required on every exported symbol** — class, function, type, constant. Review-only today (Biome doesn't enforce); contributors and reviewing agents apply this. Internal locals and test helpers don't need JSDoc.
- **Canonical shape and copy-pasteable template:** [`docs/jsdoc-style.md`](./docs/jsdoc-style.md). Coverage burndown: `pnpm jsdoc:coverage`.
- **Required tags** on exported functions and methods:
  - Short description (what it does, what it reads on-chain if anything).
  - `@param` for each parameter.
  - `@returns` describing the return shape.
  - `@throws` for each typed error class an integrator may pattern-match on.
  - One `@example` block with realistic working code: imports, client setup, the call, expected return.
- **AI-legibility is first-class.** Identical signatures across V1/V2 where protocols overlap. Discriminated unions with obvious `type` tags. Deterministic outputs verifiable byte-for-byte. Error messages read like instructions an agent can act on without guessing. Protocol-specific terms (`LLTV buffer`, `wNative`, `GeneralAdapter1`, `bundler3`, `PublicAllocator V1`, `BluePublicAllocator`, `MetaMorpho`, `Permit2`, `WAD`) live in the [`packages/morpho-sdk/AGENTS.md`](./packages/morpho-sdk/AGENTS.md) glossary.
- **Implemented TIBs are historical records.** Do not rewrite a TIB already present on the target branch to follow later code, symbol, or path changes. Keep the TIB's implementation-time names and examples intact. A changed decision gets a new superseding TIB; an operational clarification gets a dated addendum. Only a TIB introduced for the current implementation may be kept in sync with that implementation before it lands.
- **TypeDoc-generated reference** published per release.
- **Feedback loop:** if the same question is asked twice, the answer goes into the relevant `AGENTS.md` or JSDoc on the export it concerns.

> Applied by persona: [`documentation`](./.agents/pr-review-engine/agents/documentation.md) (also covers Markdown doc accuracy and pointer integrity across the repo, not just JSDoc).

---

## 7. Releases & versioning

- **SemVer, strict.** Patch: bug fixes and internal source maintenance changes. Minor: additive surface, deprecations. Major: removed/renamed/retyped public symbols.
- **CHANGELOG via Changesets** — every semver-relevant change to published package source ships with a changeset (review-only today). JSDoc-only changes to published package source may also ship a patch changeset when maintainers want them visible in package release notes. Do not generate a changeset for repo metadata, non-API documentation-only, fixture-only, generated-output-only, or tests-only changes; those do not change the published package contract.
- **Dependent package bump audit on package bumps.** Every changeset that bumps a package must be checked against downstream direct runtime `dependencies` and `peerDependencies`. Direct maintained dependents must be included in the same changeset with at least a patch bump when consumers need the dependent package's latest version to resolve the updated dependency (for example `blue-sdk` address/ABI/constant updates must patch maintained packages that depend directly on `@morpho-org/blue-sdk`, such as `morpho-sdk`). Internal peer dependency ranges are maintained manually; if a peer dependent should accept the new version or no longer accepts the old compatibility set, update its peer range and include that dependent package in the changeset with the appropriate bump.
- **`main` is always releasable.** Fork suite green per chain matrix.
- **Pin ABIs and addresses in-package.** No runtime ABI fetch; no address drift between releases.
- **4-step deprecation flow:** introduce successor → deprecate with `@deprecated` JSDoc → maintain both for one minor → remove in the next major. No silent removals.
- **Migration guides on every major**, with codemods where mechanical.
- **Cantina audit on every major release**, with the public report linked from the CHANGELOG entry. Critical CVEs trigger out-of-band patches.
- **Pre-release dogfood on every minor:** at least one internal app and one external partner before the `latest` tag flips.
- **Respect pnpm minimum release age when bumping releases.** Keep `minimumReleaseAgeStrict` enabled and do not add `minimumReleaseAgeExclude` (or equivalent bypasses) to force freshly-published dependencies through dependency bump PRs. If a dependency is too new, wait for the configured `minimumReleaseAge` window or pin to the latest eligible version; emergency bypasses require explicit maintainer approval and must be removed before merge.

> Applied by personas: [`style-conventions`](./.agents/pr-review-engine/agents/style-conventions.md) (changeset relevance), [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) (pinned ABI/address release contract), [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) (publish-flow integrity, conditional).

---

## 8. Code style & tooling

- pnpm + Node ≥26. Root checks: `pnpm lint` and `pnpm test`.
- Biome owns style: 2-space indent, organized imports, no unused imports or variables.
- NodeNext module resolution; relative imports include `.js` (`export * from "./market/index.js"`).
- Type-only imports where possible (`import type { Address } from "viem"`).
- Generated code: change generated inputs (`graphql/*.gql`), never edit generated outputs (`src/api/sdk.ts`). Never edit `lib/`.
- One concern per PR. Tests, JSDoc, and any required semver-relevant changeset land with the change — not as a follow-up.

> Applied by persona: [`style-conventions`](./.agents/pr-review-engine/agents/style-conventions.md).

---

## 9. Continuous improvement

- Existing packages may predate these rules; do not widen divergence when touching them.
- Move touched code toward the nearest applicable `AGENTS.md` guidance, even when a full cleanup is out of scope.
- **On refactor, adopt the convention.** Refactors and rewrites are the migration path — don't carry legacy patterns (misplaced tests, untyped errors, missing JSDoc, framework leakage) forward into refactored code.
- If a package can't yet meet an applicable rule, keep the exception local and document why in the nearest `AGENTS.md`.

---

## 10. Review automation & CI/release security

PR review is automated by the `/pr-review-{ci,gh,local}` slash commands, which fan out to the personas at [`.agents/pr-review-engine/agents/`](./.agents/pr-review-engine/agents/). This section is the canonical inventory of those personas and the source of truth for the CI/release rules one of them (`ci-release-security`) anchors on.

### Orchestration

| File | Role |
|---|---|
| [`.agents/commands/pr-review-{ci,gh,local}.md`](./.agents/commands/) + [`pr-fix.md`](./.agents/commands/pr-fix.md) | Caller-side commands (CI verdict / local PR / pre-PR terminal / fix). Each parses args, resolves branches, then delegates Steps 3–6 to the engine. Symlinked into `.claude/commands/`. |
| [`.agents/pr-review-engine/SKILL.md`](./.agents/pr-review-engine/SKILL.md) | Shared review **engine** (Steps 3–6) — reads `<PROJECT_CONTEXT>`, computes conditional flags, fans out the agents, then aggregates / dedups / snaps findings to diff lines. Encodes no rule; orchestrates only. Not invocable directly (not symlinked into `.claude/commands/`). Supersedes the former `lib/pr-review-base.md`. |
| [`.agents/pr-review-engine/scripts/`](./.agents/pr-review-engine/scripts/) | Deterministic helpers run by the engine / callers: `build-changed-lines`, `validate-findings`, `findings-ledger` (stateful ledger + idempotency cache), `review-scope`. Unit-tested under the `agents-engine` Vitest project. |
| [`.agents/pr-review-engine/references/`](./.agents/pr-review-engine/references/) | Shared rubric content cited by agents (changed-lines, scope-filter, calibration, secrets, injection, github-actions, skill-authoring). |

### Persona inventory

Baseline personas (always fire):

| Persona | Anchors | Focus |
|---|---|---|
| [`code-quality`](./.agents/pr-review-engine/agents/code-quality.md) | §2, §3 | Type safety, code smells, naming, cross-file impact on SDK consumers, security primitives. |
| [`module-api-architecture`](./.agents/pr-review-engine/agents/module-api-architecture.md) | §1, §2 (rule 5), §3, §4 | Package boundaries, public surface, NodeNext import discipline, boundary-level type discipline. |
| [`morpho-protocol`](./.agents/pr-review-engine/agents/morpho-protocol.md) | §1, §5, §7 | Morpho protocol semantics, ABI/address source-of-truth drift, operation routing, accounting/share-price/LLTV invariants. |
| [`web3-security`](./.agents/pr-review-engine/agents/web3-security.md) | §1 (Action layer), §2, §5 (security invariants) | Contract interactions, transaction params, permit flows, race conditions. Severity defaults to critical/high. |
| [`silent-failure-hunter`](./.agents/pr-review-engine/agents/silent-failure-hunter.md) | §2 (handling depth for rule 2 — see persona body) | Swallowed errors, missing error states, dead code paths. |
| [`style-conventions`](./.agents/pr-review-engine/agents/style-conventions.md) | §7, §8 | Biome compliance, import discipline, changeset relevance. |
| [`documentation`](./.agents/pr-review-engine/agents/documentation.md) | §6 | JSDoc on exports, Markdown doc accuracy, pointer integrity, AGENTS.md ↔ persona backlink consistency. |
| [`test-coverage`](./.agents/pr-review-engine/agents/test-coverage.md) | §5, §2 (rule 6) | Missing tests for new code paths and onchain interactions. |

Conditional personas (fire only when their trigger flag is true):

| Persona | Trigger | Anchors |
|---|---|---|
| [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) | `HAS_CI_RELEASE` (computed in [`.agents/pr-review-engine/SKILL.md`](./.agents/pr-review-engine/SKILL.md) Step 4 — the single source of truth for the changed-file patterns that flip this flag) | §10 (the rules below) |
| [`skill-authoring`](./.agents/pr-review-engine/agents/skill-authoring.md) | `HAS_PLUGIN_SKILLS` (any change under `.agents/**`, `.claude/**`, a `SKILL.md`, or a `.claude-plugin/*.json`) | §1 (single source of truth), §10 (this inventory) |

Adding a persona = drop a file under `.agents/pr-review-engine/agents/` with `applies:` frontmatter, add a row to the relevant table above, and (for a conditional persona) extend the flag detection in `.agents/pr-review-engine/SKILL.md` Step 4. The `skill-authoring` persona checks that these inventory invariants — engine roster, this table, and the `> Applied by personas:` backlinks — stay in sync.

### CI / release security rules (anchors `ci-release-security`)

These are the rules `ci-release-security` enforces. They live here as source of truth; the persona references this section by anchor. When a rule changes here, update the persona body to match.

- **Workflow injection** (CRITICAL). Never interpolate attacker-controllable GitHub context (`${{ github.event.* }}`, `${{ github.head_ref }}`, comment bodies, branch names) directly into `run:` blocks, `shell:` invocations, or third-party-action arguments. Bind to an `env:` first, then reference `$VAR` in the shell so GitHub's redaction can still apply and shell expansion can't reinterpret the value.
- **`pull_request_target` + PR-head checkout is forbidden** unless the workflow demonstrably never runs the checked-out code (no install, no test, no script). The combination grants attacker code write-scoped repo credentials.
- **ACL-gated comment triggers.** `issue_comment` / `pull_request_review_comment` workflows must gate on `github.event.comment.author_association` (`OWNER`, `MEMBER`, or `COLLABORATOR`) before acting on comment text.
- **Action pinning.** Third-party `uses:` lines pin to a full commit SHA with the human-readable tag in a trailing comment: `uses: foo/bar@<40-char-sha>  # v1.2.3`. First-party `actions/*` and `github/*` may use tagged versions when Dependabot covers them via `.github/dependabot.yml`. Newly added actions from publishers the org has not used before must surface the publisher name in the review comment so a maintainer can confirm review.
- **`permissions:` block required** on every workflow. Default `contents: read`. Job-level scopes where they differ. `id-token: write` only on OIDC / provenance-publishing jobs. `secrets: inherit` passed to reusable workflows is forbidden — list secrets explicitly.
- **Secret exposure.** Secrets must be `env:`-bound and referenced as `$VAR` inside scripts; never interpolated into the `run:` string directly. Secrets passed to third-party actions require those actions to be SHA-pinned.
- **Publish-flow integrity.** `npm publish` / `pnpm publish` must use `--provenance` (or the Changesets provenance-aware path). Auth via org-scoped `NODE_AUTH_TOKEN`, never a personal access token. Tag-scope changes (e.g. `next` → `latest`) require human sign-off via `environment:` with required reviewers. Removing `--provenance` is a downgrade — flag at minimum **medium**, **high** for runtime/peer-surface packages.
- **Release-commit signing & write-token hardening.** Release commits and annotated package tags must be created with a valid signed identity — prefer GitHub's `createCommitOnBranch` GraphQL mutation (produces GitHub-signed commits) over local `git commit` + push from a workflow. Write-scoped tokens must only be minted **after** one of these boundaries is in place: (a) same-job hardening that verifies the checksum and `$PATH` of any trusted release helper the post-token step will execute, truncates `$GITHUB_ENV` and `$GITHUB_PATH` so inherited state from earlier steps cannot influence the privileged step, and either confirms `.git/hooks/` contains only `.sample` files or forces hooks off for privileged git invocations (`core.hooksPath=/dev/null`, plus `--no-verify` on pushes); or (b) a split-job boundary where the privileged job fresh-checks out `github.sha`, consumes only a data artifact from the unprivileged job, validates that artifact with trusted code before minting the token, and confirms `.git/hooks/` contains only `.sample` files. Any enabled content under `.git/hooks/` is a hook-poisoning footgun and must be rejected or bypassed by trusted hook-disabling config. For same-job hardening, forcing the trusted `$PATH` and an explicit expected `RELEASE_BRANCH` on the write-token step is required. Loss of the applicable guards on an existing release workflow is **critical**.
- **Changesets / release-bot wiring.** `.changeset/config.json` changes (fixed, linked, baseBranch, commit) alter what gets shipped — flag for human review on every change. New release workflows or release-bot actions require pinned SHAs and explicit `permissions:`. Removing a previously-required check from a release workflow's `needs:` is **high**.
- **Lockfile drift.** A `pnpm-lock.yaml` change without a corresponding `package.json` change is acceptable for devDependency-only resolution drift when the existing manifest range already admits the new version. Flag lockfile-only changes that alter direct runtime `dependencies` or `peerDependencies`, move a dev dependency outside its declared range, change install settings, or introduce security-relevant package metadata; runtime/peer dependency changes require a manifest change plus package-version/changeset audit.
- **Dependency hygiene.** New deps in `dependencies` or `peerDependencies` of a published package default to **high** for review. Flag unpinned semver ranges (`^`/`~`) on runtime deps, names that resemble typosquats of known packages, and deps whose registry metadata declares `postinstall` / `preinstall` / `install` scripts.
- **`.npmrc` hardening.** `always-auth=true` or `_authToken=` committed to the repo is **critical** — credential leak. Non-`registry.npmjs.org` `registry=` or `@scope:registry=` lines require explicit human review (could redirect to a malicious registry).
- **Workspace install behavior.** Flips of `auto-install-peers` or `strict-peer-dependencies` in `.npmrc` or `pnpm-workspace.yaml` are **medium** — surface the impact on consumer install behavior in the review comment.
- **pnpm minimum-release-age bypasses.** `minimumReleaseAgeExclude` (or equivalent age-check bypasses) in `.npmrc` or `pnpm-workspace.yaml` are **high** unless the PR includes explicit maintainer approval, a narrowly-scoped emergency reason, and removal before merge. Removing `minimumReleaseAgeStrict` is also **high**. Dependency bump PRs should wait for the configured `minimumReleaseAge` window or pin to the latest eligible version.

> Applied by personas: [`ci-release-security`](./.agents/pr-review-engine/agents/ci-release-security.md) (the CI / release security rules above) and [`skill-authoring`](./.agents/pr-review-engine/agents/skill-authoring.md) (the persona / orchestration inventory invariants in this section).

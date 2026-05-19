# Engineering Rules

> Mission, scope, and values: see [`MISSION.md`](./MISSION.md). The rules below are how we build it.

`CLAUDE.md` is a symlink to `AGENTS.md` at every level — same content, two filenames so any agent finds it. Per-package `AGENTS.md` files refine these rules for a specific package; they may add detail but **must not contradict this file**. When in doubt, the root wins.

Every PR is measured against the rules below. A change that violates an architectural principle doesn't land — we question the change before we question the principle.

> **Enforcement note.** Some rules below are enforced by tooling today (Biome formatter, fork harness in `@morpho-org/test`, Changesets generation). Most are **review-time conventions** that humans and reviewing agents apply: JSDoc on every export, layered-import bans, the §2 forbidden-patterns list (Biome's `noExplicitAny` is warn-level, `noParameterAssign` is disabled, and there's no rule banning `as unknown as` / `@ts-ignore` / async-in-actions / framework imports / mocked viem clients on RPC paths), changeset-gates-CI, full coverage thresholds. Where a rule isn't backed by an automated check, treat it as binding regardless — wiring CI gates is tracked separately.

> **Review personas.** The review-time conventions above are applied at PR review by specialized personas under [`.agents/personas/`](./.agents/personas/), invoked by the `/pr-review-{ci,gh,local}` slash commands. See [§10](#10-review-automation--cirelease-security) for the full inventory and the CI/release rules they anchor. When a rule below changes, the matching persona's bullet must change with it — the backlinks on each section name the personas to update.

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
- **Single source of truth** per concept: one place per ABI, one place per address registry, one place per error class. Duplication is a refactor, not a feature.
- Framework adapters live in explicitly named packages (`*-wagmi`, `*-viem`). Core packages stay framework-free.
- Public API = barrel re-exports from `src/index.ts`. No deep imports across packages, ever.

### Testability: pure cores, I/O at the edge

- Network, clock, randomness, signing, env, and file I/O live **only** in boundary modules.
- Inner functions are deterministic and unit-testable without mocks. If a function is hard to test, its shape is wrong.
- Dependency injection through arguments, not globals or singletons. The viem client is always passed in.
- "Pure where possible" is a design rule, not a stylistic preference — every pure function we write is one fewer function we have to fork-test.

### Stateless, immutable, composable

- `MorphoClient` wraps a viem client + readonly options. No `init()`, no cache, no warm-up — those couple us to a host runtime and break statelessness.
- Every returned `Transaction` is `deepFreeze`d. Public fields are `readonly`. Helpers return new objects, never mutate inputs.
- Small primitives that combine. No kitchen-sink helpers; no boolean-prop explosions.
- Prefer early returns over deep nesting — guard clauses first, happy path last.

> Applied by personas: [`module-api-architecture`](./.agents/personas/module-api-architecture.md), [`web3-security`](./.agents/personas/web3-security.md) (Action-layer purity), [`silent-failure-hunter`](./.agents/personas/silent-failure-hunter.md) (testability).

---

## 2. What does not land in a PR

A scannable list of patterns reviewers reject. Most are review-only today (per the Enforcement note); treat them as binding regardless. Reviewers cite this section by number.

1. `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error` (without an issue link and a deletion plan).
2. `throw new Error(...)` from SDK source. Every failure mode is a named, exported class.
3. `async` in actions; clocks, randomness, network reads, or signing in transaction builders.
4. Mutation of input arguments.
5. Deep imports across packages (`from "@morpho-org/foo/src/internal/..."`). Public surface is `src/index.ts`.
6. Mocked viem clients on code paths that hit RPC. Use Anvil forks via `@morpho-org/test`.
7. Edits to generated outputs (`src/api/sdk.ts`, anything under `lib/`). Edit the input.
8. Framework imports (`react`, `wagmi`, `redux`, `ethers`) in core packages.
9. New runtime dependencies without a package-level reason and a written justification in the PR description.
10. PRs that ship behavior-affecting package source changes without their tests, JSDoc, and semver-relevant changeset.

> Applied by personas: [`code-quality`](./.agents/personas/code-quality.md) (forbidden patterns 1–4, 7–10), [`web3-security`](./.agents/personas/web3-security.md) (3 — signing in transaction builders), [`silent-failure-hunter`](./.agents/personas/silent-failure-hunter.md) (2 — typed errors).

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

> Applied by personas: [`code-quality`](./.agents/personas/code-quality.md), [`module-api-architecture`](./.agents/personas/module-api-architecture.md).

---

## 4. Public API & packaging

- Every public symbol is re-exported explicitly from `src/index.ts`. Nothing else is public.
- **Tree-shakeable.** ESM at source (`"type": "module"`); no top-level side effects. Every package without top-level side effects sets `"sideEffects": false` in `package.json`.
- **Dual ESM/CJS publish** from `lib/esm` and `lib/cjs`. Recommended build script: `tsc --noEmit && pnpm build:cjs && pnpm build:esm` (test/fixture-only packages may skip the type-check step). `publishConfig.exports` mirrors `types`, `import`, `require`. Subpath exports need both package exports and TS path mapping.
- **`viem` is the only peer dep of `morpho-sdk`.** Integrators install `morpho-sdk + viem` and they're done. Other packages in the monorepo (`blue-sdk-viem`, `blue-sdk-wagmi`, etc.) declare their own peer deps as needed.
- **Workspace deps** use workspace ranges (`"@morpho-org/blue-sdk": "workspace:^"`).
- Each package has one reason to exist (see §1 Modularity). Framework adapters never live in core SDK packages.
- Don't replace a small local helper with a transitive dep just to "reuse code".

> Applied by persona: [`module-api-architecture`](./.agents/personas/module-api-architecture.md).

---

## 5. Testing

- **Colocate tests with source** going forward: `foo.ts` ↔ `foo.test.ts` in the same folder. `morpho-sdk` and `evm-simulation` are the two packages currently wired for colocation in `vitest.config.ts`. For other packages, tests still live under `packages/*/test/` because their Vitest project glob does not pick up `src/**/*.test.ts` — moving a test next to source there will silently skip it. **When refactoring or rewriting a module in those packages, also widen the package's Vitest project glob to include colocated tests, and migrate that module's tests as part of the same change.** Read-only edits don't have to migrate. `evm-simulation` historically uses `*.spec.ts`; either suffix is acceptable so long as it's colocated and matched by the package's Vitest project glob.
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
- **No mocked viem clients** on RPC paths. Use Anvil forks at pinned blocks. Pure-function tests need neither Anvil nor a viem client.
- **Shared test helpers** live in `morpho-test`, `test`, `test-wagmi` — never in published runtime paths of feature packages.

> Applied by personas: [`test-coverage`](./.agents/personas/test-coverage.md) (test presence + colocation), [`web3-security`](./.agents/personas/web3-security.md) (security invariants — chainId validation, authorization, accounting).

---

## 6. Documentation

- **JSDoc is required on every exported symbol** — class, function, type, constant. Review-only today (Biome doesn't enforce); contributors and reviewing agents apply this. Internal locals and test helpers don't need JSDoc.
- **Canonical shape and copy-pasteable template:** [`docs/jsdoc-style.md`](./docs/jsdoc-style.md). Backfill rollout sequence: [`docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md`](./docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md). Coverage burndown: `pnpm jsdoc:coverage`.
- **Required tags** on exported functions and methods:
  - Short description (what it does, what it reads on-chain if anything).
  - `@param` for each parameter.
  - `@returns` describing the return shape.
  - `@throws` for each typed error class an integrator may pattern-match on.
  - One `@example` block with realistic working code: imports, client setup, the call, expected return.
- **AI-legibility is first-class.** Identical signatures across V1/V2 where protocols overlap. Discriminated unions with obvious `type` tags. Deterministic outputs verifiable byte-for-byte. Error messages read like instructions an agent can act on without guessing. Protocol-specific terms (`LLTV buffer`, `wNative`, `GeneralAdapter1`, `bundler3`, `PublicAllocator`, `MetaMorpho`, `Permit2`, `WAD`) live in the [`packages/morpho-sdk/AGENTS.md`](./packages/morpho-sdk/AGENTS.md) glossary.
- **TypeDoc-generated reference** published per release.
- **Feedback loop:** if the same question is asked twice, the answer goes into the relevant `AGENTS.md` or JSDoc on the export it concerns.

> Applied by persona: [`documentation`](./.agents/personas/documentation.md) (also covers Markdown doc accuracy and pointer integrity across the repo, not just JSDoc).

---

## 7. Releases & versioning

- **SemVer, strict.** Patch: bug fixes and internal source maintenance changes. Minor: additive surface, deprecations. Major: removed/renamed/retyped public symbols.
- **CHANGELOG via Changesets** — every semver-relevant change to published package source ships with a changeset (review-only today). JSDoc-only changes to published package source may also ship a patch changeset when maintainers want them visible in package release notes. Do not generate a changeset for repo metadata, non-API documentation-only, fixture-only, generated-output-only, or tests-only changes; those do not change the published package contract.
- **`main` is always releasable.** Fork suite green per chain matrix.
- **Pin ABIs and addresses in-package.** No runtime ABI fetch; no address drift between releases.
- **4-step deprecation flow:** introduce successor → deprecate with `@deprecated` JSDoc → maintain both for one minor → remove in the next major. No silent removals.
- **Migration guides on every major**, with codemods where mechanical.
- **Cantina audit on every major release**, with the public report linked from the CHANGELOG entry. Critical CVEs trigger out-of-band patches.
- **Pre-release dogfood on every minor:** at least one internal app and one external partner before the `latest` tag flips.

> Applied by personas: [`style-conventions`](./.agents/personas/style-conventions.md) (changeset relevance), [`ci-release-security`](./.agents/personas/ci-release-security.md) (publish-flow integrity, conditional).

---

## 8. Code style & tooling

- pnpm + Node ≥22. Root checks: `pnpm lint` and `pnpm test`.
- Biome owns style: 2-space indent, organized imports, no unused imports or variables.
- NodeNext module resolution; relative imports include `.js` (`export * from "./market/index.js"`).
- Type-only imports where possible (`import type { Address } from "viem"`).
- Generated code: change generated inputs (`graphql/*.gql`), never edit generated outputs (`src/api/sdk.ts`). Never edit `lib/`.
- One concern per PR. Tests, JSDoc, and any required semver-relevant changeset land with the change — not as a follow-up.

> Applied by persona: [`style-conventions`](./.agents/personas/style-conventions.md).

---

## 9. Continuous improvement

- Existing packages may predate these rules; do not widen divergence when touching them.
- Move touched code toward the nearest applicable `AGENTS.md` guidance, even when a full cleanup is out of scope.
- **On refactor, adopt the convention.** Refactors and rewrites are the migration path — don't carry legacy patterns (non-colocated tests, untyped errors, missing JSDoc, framework leakage) forward into refactored code.
- If a package can't yet meet an applicable rule, keep the exception local and document why in the nearest `AGENTS.md`.

---

## 10. Review automation & CI/release security

PR review is automated by the `/pr-review-{ci,gh,local}` slash commands, which fan out to the personas at [`.agents/personas/`](./.agents/personas/). This section is the canonical inventory of those personas and the source of truth for the CI/release rules one of them (`ci-release-security`) anchors on.

### Orchestration

| File | Role |
|---|---|
| [`.agents/commands/pr-review-{ci,gh,local}.md`](./.agents/commands/) | Three caller-side skills — one per use case (CI verdict / local PR / pre-PR terminal). Each parses args, resolves branches, then delegates Steps 3–6 to the shared base. |
| [`.agents/lib/pr-review-base.md`](./.agents/lib/pr-review-base.md) | Shared review base — reads `<PROJECT_CONTEXT>`, computes conditional flags, loops over personas, aggregates and deduplicates findings. Does not encode any rule itself; it only orchestrates. |

### Persona inventory

Baseline personas (always fire):

| Persona | Anchors | Focus |
|---|---|---|
| [`code-quality`](./.agents/personas/code-quality.md) | §2, §3 | Type safety, code smells, naming, cross-file impact on SDK consumers, security primitives. |
| [`module-api-architecture`](./.agents/personas/module-api-architecture.md) | §1, §3, §4 | Package boundaries, public surface, NodeNext import discipline, boundary-level type discipline. |
| [`web3-security`](./.agents/personas/web3-security.md) | §1 (Action layer), §2, §5 (security invariants) | Contract interactions, transaction params, permit flows, race conditions. Severity defaults to critical/high. |
| [`silent-failure-hunter`](./.agents/personas/silent-failure-hunter.md) | §1 (testability), §2 | Swallowed errors, missing error states, dead code paths. |
| [`style-conventions`](./.agents/personas/style-conventions.md) | §7, §8 | Biome compliance, import discipline, changeset relevance. |
| [`documentation`](./.agents/personas/documentation.md) | §6 | JSDoc on exports, Markdown doc accuracy, pointer integrity, AGENTS.md ↔ persona backlink consistency. |
| [`test-coverage`](./.agents/personas/test-coverage.md) | §5 | Missing tests for new code paths and onchain interactions. |

Conditional personas (fire only when their trigger flag is true):

| Persona | Trigger | Anchors |
|---|---|---|
| [`ci-release-security`](./.agents/personas/ci-release-security.md) | `<HAS_CI_RELEASE>` — diff touches `.github/workflows/**`, `.github/actions/**`, `.changeset/**`, any `package.json` whose `scripts.*publish*` / `scripts.*release*` field is modified, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, or any file mentioning `npm publish` / `pnpm publish` / `changeset publish` / `gh release create` (canonical detector in [`.agents/lib/pr-review-base.md`](./.agents/lib/pr-review-base.md) Step 4) | §10 (the rules below) |

Adding a persona = drop a file under `.agents/personas/` with `applies:` frontmatter, add a row to the relevant table above, and (for a conditional persona) extend the flag detection in `.agents/lib/pr-review-base.md` Step 4.

### CI / release security rules (anchors `ci-release-security`)

These are the rules `ci-release-security` enforces. They live here as source of truth; the persona references this section by anchor. When a rule changes here, update the persona body to match.

- **Workflow injection** (CRITICAL). Never interpolate attacker-controllable GitHub context (`${{ github.event.* }}`, `${{ github.head_ref }}`, comment bodies, branch names) directly into `run:` blocks, `shell:` invocations, or third-party-action arguments. Bind to an `env:` first, then reference `$VAR` in the shell so GitHub's redaction can still apply and shell expansion can't reinterpret the value.
- **`pull_request_target` + PR-head checkout is forbidden** unless the workflow demonstrably never runs the checked-out code (no install, no test, no script). The combination grants attacker code write-scoped repo credentials.
- **ACL-gated comment triggers.** `issue_comment` / `pull_request_review_comment` workflows must gate on `github.event.comment.author_association` (`OWNER`, `MEMBER`, or `COLLABORATOR`) before acting on comment text.
- **Action pinning.** Third-party `uses:` lines pin to a full commit SHA with the human-readable tag in a trailing comment: `uses: foo/bar@<40-char-sha>  # v1.2.3`. First-party `actions/*` and `github/*` may use tagged versions when Dependabot covers them via `.github/dependabot.yml`.
- **`permissions:` block required** on every workflow. Default `contents: read`. Job-level scopes where they differ. `id-token: write` only on OIDC / provenance-publishing jobs. `secrets: inherit` passed to reusable workflows is forbidden — list secrets explicitly.
- **Secret exposure.** Secrets must be `env:`-bound and referenced as `$VAR` inside scripts; never interpolated into the `run:` string directly. Secrets passed to third-party actions require those actions to be SHA-pinned.
- **Publish-flow integrity.** `npm publish` / `pnpm publish` must use `--provenance` (or the Changesets provenance-aware path). Auth via org-scoped `NODE_AUTH_TOKEN`, never a personal access token. Tag-scope changes (e.g. `next` → `latest`) require human sign-off via `environment:` with required reviewers. Removing `--provenance` is a downgrade — flag at minimum **medium**, **high** for runtime/peer-surface packages.
- **Release-commit signing & write-token hardening.** Release commits and annotated package tags must be created with a valid signed identity — prefer GitHub's `createCommitOnBranch` GraphQL mutation (produces GitHub-signed commits) over local `git commit` + push from a workflow. Write-scoped tokens must only be minted **after** the workflow has (a) verified the checksum and `$PATH` of any trusted release helper the post-token step will execute, (b) truncated `$GITHUB_ENV` and `$GITHUB_PATH` so inherited state from earlier steps cannot influence the privileged step, and (c) confirmed `.git/hooks/` contains only `.sample` files (any other content is a hook-poisoning footgun and must be rejected). Forcing the trusted `$PATH` and an explicit expected `RELEASE_BRANCH` on the write-token step is required. Loss of any of these guards on an existing release workflow is **critical**.
- **Changesets / release-bot wiring.** `.changeset/config.json` changes (fixed, linked, baseBranch, commit) alter what gets shipped — flag for human review on every change. New release workflows or release-bot actions require pinned SHAs and explicit `permissions:`. Removing a previously-required check from a release workflow's `needs:` is **high**.
- **Lockfile drift.** A `pnpm-lock.yaml` change without a corresponding `package.json` change is a finding unless the PR description explains why (transitive bump, security patch).
- **Dependency hygiene.** New deps in `dependencies` or `peerDependencies` of a published package default to **high** for review. Flag unpinned semver ranges (`^`/`~`) on runtime deps, names that resemble typosquats of known packages, and deps whose registry metadata declares `postinstall` / `preinstall` / `install` scripts.
- **`.npmrc` hardening.** `always-auth=true` or `_authToken=` committed to the repo is **critical** — credential leak. Non-`registry.npmjs.org` `registry=` or `@scope:registry=` lines require explicit human review (could redirect to a malicious registry).

> Applied by persona: [`ci-release-security`](./.agents/personas/ci-release-security.md).

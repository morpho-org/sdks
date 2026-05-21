# TIB-2026-05-21: Pull `0xbulma/claude-skills` learnings into the `.agents/` PR review engine

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| **Status** | Accepted                                    |
| **Date**   | 2026-05-21                                  |
| **Author** | @0xbulma                                    |
| **Scope**  | Repo-wide (`.agents/`, `AGENTS.md` §10)     |

---

## Context

The repo's PR review automation lives under `.agents/`:

- 3 caller commands at `.agents/commands/pr-review-{ci,gh,local}.md`.
- 1 shared base at `.agents/lib/pr-review-base.md` (Steps 3–6: diff, context, fan-out, aggregate).
- 9 personas at `.agents/personas/*.md` (8 baseline + 1 conditional `ci-release-security`).
- Inventory and rules are codified in [`AGENTS.md`](../../AGENTS.md) §10; every persona's `applies:` frontmatter cites the `AGENTS.md` section(s) it enforces.

In parallel, an external Claude Code plugin — [`0xbulma/claude-skills`](https://github.com/0xbulma/claude-skills) — has evolved the same architecture into a more rigorous engine. Same shape (caller → engine → parallel personas → dedup), but with structural improvements that address review-noise problems we also have:

1. **Findings on lines the diff didn't touch.** Our scope filter only drops findings whose file is not in the diff. Agents flagging pre-existing untyped errors / missing JSDoc on unchanged lines of a *touched* file get through. The external engine builds a `CHANGED_LINES` map from `git diff --unified=0` and drops findings outside a ±15-line tolerance window.
2. **Free-form descriptions reviewers can't act on.** Our finding schema is `{severity, file, line, description}` with no constraint on description shape. Agents drift between "this is a bug" and "consider X for readability". The external engine enforces `WHAT: <problem>. FIX: <code change>.` in every description.
3. **Silent drops.** When our scope filter drops a finding, the user has no signal that it happened. The external engine surfaces a `<DROPPED_FINDINGS>` audit trail (collapsible `<details>` in GH comments, JSON on disk for local runs).
4. **Markdown documentation false-positives.** Agents regularly flag example code inside fenced blocks of `.md` files as if it were live code. The external engine has a CommonMark-fence-aware filter for this.
5. **Determinism scattered across English prose.** Our engine re-derives diff math and edge-case handling (renames, deletion-only hunks) in prose at every run. The external engine ships bundled scripts — we adopt the pattern but reimplement in TypeScript (matches the repo's strict-TS / NodeNext / zero-`any` discipline from [`AGENTS.md`](../../AGENTS.md) §3 + §8; no Python toolchain, no `.mjs` carve-out).
6. **One coarse conditional persona** (`ci-release-security`) fires whenever any of CI / release / dependency files are touched — wastes a parallel agent and dilutes focus. The external engine splits these into three narrowly-triggered personas.
7. **No versioning** on the engine or personas. Updates to a persona's prompt body are invisible to anyone reading the git history of a single file. The external engine uses semver frontmatter on the engine + every agent.

These improvements were earned on a working plugin; absorbing them here is straightforward and risk-bounded. What we must **not** lose is the specificity that makes this repo's reviewer useful: the Morpho-specific personas (`morpho-protocol`, `web3-security` with Morpho semantics, etc.), the `applies:` anchorage to `AGENTS.md` §X, and the protocol source-of-truth context block in Step 4. An off-the-shelf generic agent set cannot replicate these.

## Goals / Non-Goals

**Goals**

- Cut review noise by adopting the external engine's deterministic scope filter (file + ±15 line tolerance) and Markdown-fence filter.
- Make findings mechanically actionable by enforcing a `WHAT:`/`FIX:` schema and validating it.
- Expose the audit trail (`<DROPPED_FINDINGS>`) so filter false-positives are visible, not silent.
- Split `ci-release-security` into three narrowly-triggered conditional personas — each anchored to a discrete §10 sub-rule cluster — so reviews fire only the agents the diff actually needs.
- Add semver versioning to the engine and personas so prompt drift is auditable.
- Add a lightweight invariant test to prevent future PRs from breaking the `applies:` ↔ `AGENTS.md` ↔ `<HAS_*>` flag wiring.
- Move deterministic logic (diff parsing, schema validation, fence detection) into bundled scripts; keep the engine's prose to orchestration, not algorithm.

**Non-Goals**

- Do **not** change the Morpho-specific baseline persona inventory. `morpho-protocol`, `web3-security`, `code-quality`, `module-api-architecture`, `silent-failure-hunter`, `style-conventions`, `documentation`, `test-coverage` stay as they are — they are the specificity this TIB is preserving.
- Do **not** change the rules codified in `AGENTS.md` §10. This TIB updates only the §10 persona-inventory tables to reflect the split; the rules themselves are untouched.
- Do **not** import React/Next/Tailwind/styling/accessibility/AI-SDK/runtime-validation personas. This is a TypeScript SDK monorepo with no UI surface.
- Do **not** restructure `.agents/` as a Claude Code plugin marketplace. The current layout is intentionally close to the rules it enforces.
- Do **not** add a `SessionStart` external-rubric installer. Orthogonal to the in-repo `.agents/` model.

## Current Solution

What exists today (full inventory in [`AGENTS.md`](../../AGENTS.md) §10):

- **Caller commands** ([`.agents/commands/`](../../.agents/commands/)): `pr-review-ci.md`, `pr-review-gh.md`, `pr-review-local.md`. Each handles arg parsing, env validation, branch resolution, and the mode-specific report (CI verdict / GH comment / terminal).
- **Shared engine** ([`.agents/lib/pr-review-base.md`](../../.agents/lib/pr-review-base.md)): Steps 3–6. Step 3 computes the diff and reads changed files. Step 4 reads `<PROJECT_CONTEXT>` and computes conditional flags (`<HAS_CI_RELEASE>`, `<HAS_PROTOCOL_SURFACE>`). Step 5 fans out parallel sub-agents. Step 6 aggregates, deduplicates, and returns `<FINDINGS>` + `<FAILED_AGENTS>` + `<COUNTS>` + `<TOTAL_AGENTS_LAUNCHED>`.
- **Personas** ([`.agents/personas/`](../../.agents/personas/)): 8 baseline (`code-quality`, `module-api-architecture`, `morpho-protocol`, `web3-security`, `silent-failure-hunter`, `style-conventions`, `documentation`, `test-coverage`) + 1 conditional (`ci-release-security`, triggered by `<HAS_CI_RELEASE>`). Each has `applies:` frontmatter citing `AGENTS.md` sections, plus `out-of-scope`, `focus`, `severity-guidance`.

Strengths to preserve: Morpho-specific baseline personas, `applies:` anchoring, `<HAS_PROTOCOL_SURFACE>` flag and Step 4's protocol source-of-truth context (narrow ABI/address/constant excerpts from `packages/*-viem/src/abis.ts`, `packages/blue-sdk/src/constants.ts`, `packages/morpho-sdk/AGENTS.md`).

Gaps to close: see Context above (line-level filter, schema, audit trail, fence filter, determinism, persona split, versioning, invariant test).

## Proposed Solution

Absorb the external engine's structural learnings into `.agents/` without touching the Morpho-specific persona inventory or §X anchorage. Concretely, this TIB decides to **adopt** the following:

1. **Engine frontmatter** on `lib/pr-review-base.md`: `name: pr-review-base`, `version: 0.1.0`, `kind: engine`, `disable-model-invocation: true`. No file move or rename.
2. **Versioning frontmatter** on every persona file (`version: 1.0.0` initial). Bump per substantive change; documented in `AGENTS.md` §10.
3. **`<CHANGED_LINES>` map** built in Step 3 from `git diff --unified=0`, serialized as JSON `{ "<path>": [<line>, ...] }`, and injected into the sub-agent envelope.
4. **±15-line tolerance window** in Step 6 sub-step 1. Findings outside the window dropped as `pre_existing`; tagged with `distance_to_nearest_changed_line` for audit. Pure renames (empty `CHANGED_LINES` for a file) short-circuit the line filter.
5. **`WHAT:` / `FIX:` description schema.** Every finding's `description` must contain both clauses. Step 6 sub-step 2 routes missing-clause findings into `<FAILED_AGENTS>` (kept but flagged) — never silently dropped.
6. **`<DROPPED_FINDINGS>` audit trail** added to the engine's output contract. Each dropped finding is tagged with `drop_reason` ∈ {`file_out_of_scope`, `line_pre_existing`, `doc_example_fp`}. Callers render it:
   - `pr-review-gh`: collapsible `<details>` block; full JSON to `/tmp/pr-review-gh-<PR>-dropped.json`.
   - `pr-review-local`: terminal summary (counters only); JSON to `/tmp/`.
   - `pr-review-ci`: JSON to `/tmp/` only — keep the formal GH review body tight (verdict + actionable findings).
7. **Markdown documentation-example filter.** Findings on `.md` files whose cited line falls inside a CommonMark fenced code block are dropped with reason `doc_example_fp`. Full rule (fence handling, off-by-one, limitations) lives in `.agents/references/scope-filter.md`.
8. **Bundled scripts** at `.agents/lib/scripts/` — TypeScript, run via `pnpm tsx` (the repo already requires Node ≥22 and strict TS; `tsx` is added as a root `devDependency` if not already present):
   - `build-changed-lines.ts` — parses `git diff --unified=0` (spawned via `node:child_process`), emits the `<CHANGED_LINES>` JSON. Handles deletion-only and pure-rename edge cases.
   - `validate-findings.ts` — applies the WHAT/FIX schema + ±15 window + Markdown fence filter. Emits dropped findings with `drop_reason` and `distance_to_nearest_changed_line`.
   Both scripts: strict TS (`readonly` public fields, typed errors named per [`AGENTS.md`](../../AGENTS.md) §2.2, no `any`); rely on the Node stdlib only (no transitive `dependencies` — `tsx` is the sole devDep, and only for execution); read JSON from stdin / file args; write JSON to stdout; exit non-zero on parse failure. Invocation pattern: `pnpm tsx .agents/lib/scripts/<script>.ts`. They supersede the prose specs of those checks in `lib/pr-review-base.md`; the prose retains only orchestration.
9. **`references/` directory** at `.agents/references/`:
   - `calibration.md` — kept + dropped finding examples, ±15 rationale.
   - `changed-lines.md` — deletion-only and pure-rename edge cases for the script.
   - `scope-filter.md` — Markdown fence detection rule, path normalization.
   Loaded on demand by Step 5's envelope; not slash-invocable (frontmatter `disable-model-invocation: true`).
10. **Sub-agent prompt envelope** rewritten as an explicit, numbered, 8-slot contract Step 5 must "copy verbatim — do NOT paraphrase":
    1. Persona file body, verbatim.
    2. `<PROJECT_CONTEXT>` from Step 4 (root + per-package docs, lint contract, protocol source-of-truth excerpts when `<HAS_PROTOCOL_SURFACE>`).
    3. Full diff (committed + uncommitted when `<DIFF_SOURCE>=local`).
    4. Full content of changed files (read from local FS via Read tool).
    5. Conditional flag values.
    6. `<CHANGED_LINES>` as JSON.
    7. Shared per-agent contract bullets (verbatim).
    8. **Calibration examples** — one kept-finding + one dropped-finding from `references/calibration.md`, verbatim.
11. **Split `ci-release-security` into three conditional personas**, each anchored to a discrete §10 sub-rule cluster:
    - `ci-security.md` — `trigger: <HAS_WORKFLOWS>`. §10 workflow injection, `pull_request_target` + PR-head checkout, ACL-gated comment triggers, action pinning, `permissions:` block, secret exposure.
    - `release-integrity.md` — `trigger: <HAS_RELEASE>`. §10 publish-flow integrity (`--provenance`, org tokens), release-commit signing & write-token hardening, Changesets / release-bot wiring.
    - `dependencies.md` — `trigger: <HAS_DEPS>`. §10 lockfile drift, dependency hygiene (typosquats, `postinstall` scripts), `.npmrc` hardening.
    Each persona's `applies:` frontmatter cites its specific §10 sub-rules. The single combined `ci-release-security.md` is deleted.
12. **New conditional flags** in Step 4 (replace `<HAS_CI_RELEASE>`):
    - `<HAS_WORKFLOWS>` — true if any changed file matches `.github/workflows/**` or `.github/actions/**`.
    - `<HAS_RELEASE>` — true if any changed file matches `.changeset/**`, a `package.json` whose `scripts.*publish*` / `scripts.*release*` field is modified, or any file containing `changeset publish`, `npm publish`, `pnpm publish`, `gh release create`.
    - `<HAS_DEPS>` — true if any changed file matches `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `.npmrc` (any level). Note: `package.json` dependency changes are caught by §10's lockfile-drift rule via `<HAS_RELEASE>` + `<HAS_DEPS>` together when the lock is also touched.
13. **`<EXCLUDE_AGENTS>` input** in the caller→engine contract. Accepts a list of persona names; the engine drops them from the Step 5 launch set. Default empty. No caller uses it today; added as a forward-compat hook (e.g. for an orchestrator persona that iterates with a subset).
14. **Lightweight invariant test** at `.agents/test/pr-review-engine.test.sh` (Bash, idempotent, no external test runner):
    - Every persona file has parseable YAML frontmatter.
    - Every persona has `name`, `kind`, `version`, `applies` fields.
    - Every `kind: conditional` persona has a `trigger:` whose flag name appears in Step 4 of `lib/pr-review-base.md`.
    - Every script in `.agents/lib/scripts/` is executable (`test -x`).
    - `AGENTS.md` §10's persona-inventory tables match the actual files under `.agents/personas/`.
    Wired into `pnpm test:agents` (advisory, non-blocking initially).
15. **`AGENTS.md` §10 updates**: replace the `ci-release-security` row with three rows (one per split persona); reference the new bundled scripts and `references/` directory; document the new flags in the trigger column. The §10 rules themselves are unchanged — only the persona-inventory tables move.

### Implementation Phases

Each phase is one focused PR. None of them ship behaviour-affecting source for published packages, so no Changesets entries are needed — `chore(agents): …` commits.

- **Phase 1 — Engine scaffolding (no behaviour change).** Add `version` frontmatter to `lib/pr-review-base.md` + every persona (initial `1.0.0`). Create empty `.agents/lib/scripts/` and `.agents/references/`. Add `disable-model-invocation: true` to `lib/pr-review-base.md`. Update `AGENTS.md` §10 references (not rules) to reflect the new layout.
- **Phase 2 — Determinism (TypeScript scripts).** Write `build-changed-lines.ts` and `validate-findings.ts` under `.agents/lib/scripts/`. Strict TS, NodeNext, Node stdlib only — no runtime `dependencies` added; `tsx` is added as a root `devDependency` if not already present (execution-only, not bundled into any published package). Add `references/changed-lines.md` and `references/scope-filter.md`. Rewrite `lib/pr-review-base.md` Step 3 to invoke `pnpm tsx .agents/lib/scripts/build-changed-lines.ts` and Step 6 sub-step 1 to invoke `pnpm tsx .agents/lib/scripts/validate-findings.ts`. Inject `<CHANGED_LINES>` into the Step 5 envelope.
- **Phase 3 — Schema + audit trail.** Add the `WHAT:`/`FIX:` requirement to the per-agent contract in Step 5. Add `<DROPPED_FINDINGS>` to the output contract. Add `references/calibration.md` (kept + dropped examples). Update `pr-review-gh` Step 7 to render the audit-trail `<details>` block; `pr-review-local` Step 7 to print terminal counters; `pr-review-ci` to write JSON to `/tmp/` only.
- **Phase 4 — Persona split.** Create `ci-security.md`, `release-integrity.md`, `dependencies.md` with `applies:` anchored to their respective §10 sub-rules. Delete `ci-release-security.md`. Add `<HAS_WORKFLOWS>` / `<HAS_RELEASE>` / `<HAS_DEPS>` to Step 4; retire `<HAS_CI_RELEASE>`. Update `AGENTS.md` §10 inventory tables. Add `<EXCLUDE_AGENTS>` to the caller→engine contract.
- **Phase 5 — Invariant test.** Write `.agents/test/pr-review-engine.test.sh`. Wire into the repo's test surface (likely via `pnpm test:agents` or similar). Initially advisory; flip to blocking once the test stabilises across two consecutive green main runs.

## Considered Alternatives

### Alternative 1: Adopt the external repo's plugin layout wholesale

Move `.agents/` to a Claude Code plugin structure (`plugins/local/skills/pr-review-engine/SKILL.md`, etc.).

**Why rejected:** The in-repo `.agents/` model is intentionally co-located with the rules it enforces (sits next to `AGENTS.md`). Plugin-marketplace structure adds an indirection layer without value here — no shared distribution across repos, no SessionStart installer needed. The cost-benefit favours keeping the existing layout and absorbing only the structural learnings (frontmatter conventions, scripts, references).

### Alternative 2: Keep `ci-release-security` as one persona

Leave the combined persona in place; tighten its `applies:` anchorage and skip the split.

**Why rejected:** `AGENTS.md` §10's rules are organised into three independently-triggered concerns (CI security, release integrity, dependency hygiene). Firing all three when only `pnpm-lock.yaml` changed wastes a parallel agent and dilutes the persona's focus. The split mirrors the existing §10 sub-section structure exactly — no rule duplication, three sharper personas. The `applies:` frontmatter on each split persona still cites the §10 sub-rules it owns, so anchorage is preserved (in fact strengthened — each persona points at a narrower rule set).

### Alternative 3: Adopt generic baseline personas from the external repo

Replace `morpho-protocol`, `web3-security`, `code-quality`, `module-api-architecture`, etc. with the external repo's generic six (`correctness`, `error-handling`, `docs`, `tests`, `simplification`, `performance`).

**Why rejected:** Explicit user instruction to keep specificity and anchorage. The Morpho-specific personas are the differentiator — they encode protocol semantics (ABI/address drift, operation routing, accounting/LLTV/share-price invariants) that no generic persona can replicate. The external repo's six are good starting points for a fresh plugin, not a substitute for what this repo has earned.

### Alternative 4: Skip the bundled scripts; keep prose-only spec

Keep the engine as a single Markdown document with the diff math and schema validation described in English.

**Why rejected:** Prose is exactly where the external repo drifted before adopting the scripts. Anthropic's own skill guide (cited in their `SKILL.md`) puts it crisply: "Code is deterministic; language interpretation isn't." Scope-filter accuracy is non-negotiable — a flaky filter erodes trust in every review. The 100-ish lines of bundled shell+Python carry their weight.

## Assumptions & Constraints

- The `.agents/` directory is review-time tooling — no published package depends on it; no Changesets entries are required for this TIB's implementation phases.
- Node ≥22 + Bash are available locally and in CI (already true — repo standard per [`AGENTS.md`](../../AGENTS.md) §8). No Python dependency.
- The repo has (or will have at Phase 2) `tsx` as a root `devDependency`. `tsx` is the standard runner for TypeScript scripts in pnpm/Node monorepos; it does not affect any published package's runtime or peer-dep surface (it's strictly a dev tool).
- `gh` CLI is authenticated for `pr-review-gh` / `pr-review-ci` (already true).
- The external repo (`0xbulma/claude-skills`) is a reference design only — we are not taking a runtime dependency on it. The TIB freezes the relevant ideas at this date; future drift in the external repo does not bind us.
- The Morpho-specific persona inventory is stable. If a future TIB adds a new baseline persona, it adds a row to `AGENTS.md` §10 and a file under `.agents/personas/` — but that is out of scope for this TIB.

## Dependencies

- No new runtime dependencies for any published package.
- One **devDependency** added at the repo root if not already present: `tsx` (used only to execute the `.agents/lib/scripts/*.ts` files; never imported by published code). The engine scripts themselves use Node stdlib only.
- Implementation phases depend only on the repo's existing toolchain: Node ≥22, `tsx`, Bash, `git`, and `gh`. No Python.

## Security

This TIB does not change the rules codified in `AGENTS.md` §10. The CI / release / dependency security rules — workflow injection prevention, action pinning, `permissions:` discipline, secret exposure, publish-flow integrity (`--provenance`), release-commit signing & write-token hardening, lockfile drift, dependency hygiene, `.npmrc` hardening — remain authoritative. The split into three personas (`ci-security` / `release-integrity` / `dependencies`) sharpens enforcement without changing the substance of any rule.

One forward-looking consideration: the bundled `validate-findings.ts` parses agent output. The script must defensively handle malformed input (non-array, missing fields, non-string paths, non-integer lines) and route every failure mode into `<FAILED_AGENTS>` rather than silently dropping. This is already required behaviour today; codifying it in TypeScript (not prose) tightens the contract — the parser exposes a typed `Finding` interface with `readonly` fields, and the failure modes are exported as named error classes per [`AGENTS.md`](../../AGENTS.md) §2.2 / §3.

## Future Considerations

- **Orchestrator persona / iteration loop**: the external repo's `tib-ship` skill uses `<EXCLUDE_AGENTS>` to suppress `runtime-validation` during inner iterations. If we ever introduce an analogous orchestrator (e.g. for automated TIB execution), the `<EXCLUDE_AGENTS>` hook is already in place.
- **CI-mode invocation of the engine**: nothing in the engine is CI-specific; the only difference is the caller's Step 7 output rendering. If we want to run the engine inside a GitHub Action (instead of the existing `/pr-review-ci` flow), the `disable-model-invocation` engine flag does not block it — only direct slash invocation is blocked.
- **Generic persona migration**: if a future TIB introduces React/Next surface in this repo (e.g. a docs site), the external repo's `react-next`, `styling`, `accessibility`, `ai-sdk` personas are ready to adopt — same architecture, same frontmatter shape.

## Open Questions

- Should the invariant test be wired as `pnpm test:agents` (new top-level script) or invoked from an existing test target (e.g. `pnpm test` root-level)? Defer to Phase 5 PR review.
- Should `<HAS_RELEASE>` also trigger when only a top-level `package.json` `version` field changes (not a `scripts.*publish*` change)? Probably no — version bumps come through Changesets, which already trips the flag via `.changeset/**`. Will validate during Phase 4.

## References

- [`AGENTS.md`](../../AGENTS.md) §10 — Review automation & CI/release security (source of truth this TIB updates the inventory tables of).
- [`0xbulma/claude-skills`](https://github.com/0xbulma/claude-skills) — external Claude Code plugin whose engine, scripts, and conditional-persona-split design this TIB absorbs.
- [`0xbulma/claude-skills`: `plugins/local/skills/pr-review-engine/SKILL.md`](https://github.com/0xbulma/claude-skills/blob/main/plugins/local/skills/pr-review-engine/SKILL.md) — reference engine spec.
- [`.agents/lib/pr-review-base.md`](../../.agents/lib/pr-review-base.md) — current engine, to be augmented per this TIB.
- [`.agents/personas/`](../../.agents/personas/) — current persona inventory, to be split per Phase 4.

## Addenda

### 2026-05-21 — Drop `tsx` dependency in favour of native Node TS

**Author:** @0xbulma

The TIB body proposes `tsx` as a root `devDependency` used to execute `.agents/lib/scripts/*.ts`. During Phase 2 execution, native Node 24 (the repo's runtime per `engines.node >= 22.13`) was confirmed to strip TypeScript types out of the box (`node --experimental-strip-types`-equivalent behaviour stable in Node ≥22.6). The bundled scripts are written within the strip-only subset (no parameter properties, no `enum`, no namespaces) and run under plain `node .agents/lib/scripts/<script>.ts` — no transpiler needed.

**Operational changes** (decision unchanged — still TypeScript scripts, still Node stdlib only):

- `pnpm tsx <script>.ts` → `node <script>.ts` everywhere in the engine prose, references docs, and Phase-5 invariant test.
- No `tsx` devDependency. The Dependencies section's "one devDependency added" claim no longer applies.
- The Phase-2 commit also did NOT need to add a `pnpm.onlyBuiltDependencies` entry for `esbuild` (which would have been needed had `tsx` shipped).

Why it matters: the engine has zero new build-time dependencies. The toolchain is exactly what was there before plus two TS files and one Bash-free invariant test.

### 2026-05-21 — Phase-2 unit tests replaced by Phase-5 integration test

**Author:** @0xbulma

The TIB body's Phase 2 implicitly expected colocated `*.test.ts` unit tests for the two scripts (per AGENTS.md §5 colocation rule). During execution, the user directed scope reduction: skip Phase-2 unit tests; rely on Phase 5's invariant test plus end-to-end smoke runs during development.

**Rationale:** the scripts have a thin CLI surface, no business logic that benefits from unit isolation. The Phase-5 invariant test verifies they parse and execute under native Node; manual end-to-end smoke runs confirm the JSON output shape. Adding vitest project-glob wiring for a two-script directory was deemed not worth the config surface.

This is an operational scope-reduction, not a rule waiver — if either script grows non-trivial logic that benefits from unit tests, the colocation rule from AGENTS.md §5 still applies and a follow-up TIP should add them.

<!--
TIB conventions:
- Once accepted, do not substantively edit this TIB. If the decision needs to change,
  create a new TIB that supersedes this one and update the Status/Superseded by fields.
- Addenda may be appended to record operational updates that affect
  how the TIB is applied without changing the decision itself.
- TIB identifiers use CalVer (YYYY-MM-DD) based on the date the TIB was first drafted.
- A TIB is a *proposal* until its Status becomes Accepted. Once accepted, the rule the
  TIB decides on is codified in the relevant section of `AGENTS.md`; the TIB stays as
  the dated record of how the decision was reached. TIBs feed `AGENTS.md` — they do
  not override it.
-->

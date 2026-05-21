---
name: pr-review-engine
kind: engine
version: 0.2.0
disable-model-invocation: true
description: Shared Steps 3–6 of the in-repo PR review automation. Consumed by .agents/commands/pr-review-{ci,gh,local}.md — do NOT invoke directly. Walks .agents/pr-review-engine/agents/*.md and fans out per-persona sub-agents over the diff.
---

# pr-review base — shared Steps 3–6

This file is the shared review base for the three `/pr-review-*` slash commands. It is invoked indirectly via:

- `/pr-review-ci` — CI verdict mode
- `/pr-review-gh` — Local PR review (post as `COMMENT`)
- `/pr-review-local` — pre-PR local review (terminal-only)

Do NOT invoke this file directly. It assumes the caller has resolved branches and head SHA in its own Steps 1–2 and computed `<MERGE_BASE>` per Step 3 below.

The base contract: callers must pass these resolved values into Steps 3–6 and consume the deduplicated findings list + `<FAILED_AGENTS>` count produced by Step 6.

## Inputs (from caller's Steps 1–2)

| Caller-provided | Source |
|---|---|
| `<OWNER>`, `<REPO>` | parsed from git remote |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` (PR modes) OR `git branch --show-current` (Local-only) |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` (PR modes) OR `--local` arg / auto-detected |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid` (PR modes) OR `git rev-parse HEAD` (Local-only) |
| `<DIFF_SOURCE>` | `pr` (use `origin/<BASE_BRANCH>...origin/<HEAD_BRANCH>`) OR `local` (use `origin/<BASE_BRANCH>...HEAD` and include uncommitted) |
| `<EXCLUDE_AGENTS>` | Optional list of persona names to skip in Step 5. Defaults to `[]`. Forward-compat hook for future orchestrators (e.g. an iteration loop that suppresses a costly persona during inner iterations and runs it once after convergence). |

## Step 3: Get the diff locally

**Use the local repo on disk, NOT the GitHub API.**

Compute the merge-base, the diff, and the `<CHANGED_LINES>` map:

```bash
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> <HEAD_REF>)
# <HEAD_REF> is origin/<HEAD_BRANCH> for <DIFF_SOURCE>=pr, or HEAD for <DIFF_SOURCE>=local

git diff $MERGE_BASE..<HEAD_REF>
git diff --name-only $MERGE_BASE..<HEAD_REF>

# Build the per-file CHANGED_LINES map. Used by Step 5 (envelope
# injection) and Step 6 (scope filter, line-level). Deterministic
# parsing — do NOT reimplement in prose. Edge cases (deletion-only
# hunks, pure renames, file deletions) are documented in
# .agents/pr-review-engine/references/changed-lines.md.
git diff --unified=0 $MERGE_BASE..<HEAD_REF> \
  | node .agents/pr-review-engine/scripts/build-changed-lines.ts \
  > /tmp/pr-review-changed-lines.json
```

If `<DIFF_SOURCE>=local` AND uncommitted changes exist, also include them:

```bash
git diff HEAD                  # combined staged + unstaged
git diff --name-only HEAD

# Merge the uncommitted hunks into CHANGED_LINES — uncommitted shadows
# committed for files appearing in both (the agent reads the working
# tree, not git's index).
git diff --unified=0 HEAD \
  | node .agents/pr-review-engine/scripts/build-changed-lines.ts \
  > /tmp/pr-review-changed-lines-uncommitted.json
```

Merge the two JSON maps in your shell of choice (typically `jq -s 'add'`); the uncommitted side wins on collisions.

Combine the two file lists, deduplicate, announce the count of uncommitted files included so the user knows the review covers their full work-in-progress:

> "Including X uncommitted file(s) in the review."

If both diffs are empty, return an empty result to the caller (it will emit the appropriate "no changes to review" sentinel).

Read each changed file from the local filesystem using the Read tool so agents have full file context (not just diff hunks).

## Step 4: Read project context (adaptive)

Before launching review agents, read the project-level documentation that defines the rules and intent of this repo. Store what you find as `<PROJECT_CONTEXT>` and pass it to each agent in Step 5.

### Always read (root-level baseline)

1. `AGENTS.md` (root) — engineering rules. Canonical file; `CLAUDE.md` is a symlink to it (do not also read CLAUDE.md).
2. `MISSION.md` — mission, scope, and values. Explains *why* the rules exist.
3. `CONTRIBUTING.md` — dev setup, package layout, release/changesets flow.
4. `biome.json` — style/lint rules enforced on PRs (`pnpm lint`).

### Conditional baseline (read when relevant)

5. `docs/jsdoc-style.md` — canonical JSDoc style guide. Read whenever the diff touches an exported symbol from any `packages/<pkg>/src/index.ts` re-export entry, an `@example` block, or any JSDoc comment.
6. `SECURITY.md` — security policy. Read if any security-relevant code is touched.
7. `docs/tibs/TEMPLATE.md` — read if a doc/TIB-style file is touched.

### Per-package context (only for packages touched by the diff)

For each unique package directory among the changed files (e.g. a file at `packages/morpho-sdk/src/actions/foo.ts` belongs to package `packages/morpho-sdk`), read:

1. `packages/<pkg>/AGENTS.md` — package-specific refinements (refines the root for this package; root wins on contradictions).
2. `packages/<pkg>/README.md` — public-facing description.
3. `packages/<pkg>/ARCHITECTURE.md` — if present.
4. Any other top-level `*.md` in the package (e.g. `packages/morpho-sdk/BUNDLER3.md`).
5. Nested `AGENTS.md` along the path of touched files (at any depth — e.g. `packages/morpho-sdk/src/actions/AGENTS.md`).

Use the Glob tool: `**/AGENTS.md` and `packages/*/*.md`. Filter to paths that prefix at least one changed file's directory. Files outside `packages/` use only items 1–4 of the root baseline (items 5–7 conditional as triggered).

### Protocol source-of-truth context (when relevant)

If the diff touches protocol-facing SDK surface — action/entity/helper code, viem/wagmi contract calls, typed-data helpers, ABI/address/constant registries, or files mentioning `encodeFunctionData`, `readContract`, `writeContract`, `simulateContract`, `MarketParams`, `VaultV2`, `MetaMorpho`, `bundler3`, `GeneralAdapter1`, `PublicAllocator`, `Permit2`, `LLTV`, `WAD`, `maxSharePrice`, `minSharePrice`, `abi`, or `functionName` — add targeted protocol context for `morpho-protocol` and `web3-security`.

Do **not** dump huge ABI files wholesale. Instead, search/read narrow excerpts around the relevant symbol(s) from:

1. `packages/blue-sdk-viem/src/abis.ts` — Morpho Blue, MetaMorpho, VaultV2, factories, PublicAllocator, adapter ABIs, permit ABIs.
2. `packages/bundler-sdk-viem/src/abis.ts` — bundler3 and adapter ABIs.
3. `packages/liquidation-sdk-viem/src/abis.ts` — liquidation-specific ABIs when liquidation code is touched.
4. `packages/blue-sdk/src/constants.ts` and `packages/morpho-sdk/src/helpers/constant.ts` — protocol scales, limits, and fixed constants.
5. `packages/morpho-sdk/AGENTS.md` plus nested `AGENTS.md` such as `packages/morpho-sdk/src/actions/AGENTS.md` — routing, glossary, native wrapping, and reallocation rules.

If no matching ABI/address/constant excerpt is found for a changed protocol call, record that absence in `<PROJECT_CONTEXT>` instead of letting agents infer from memory.

### Detect conditional persona triggers

Compute flags from the changed-files list. These flags are passed to every persona; flags for `kind: conditional` personas also drive whether they launch in Step 5:

- `<HAS_WORKFLOWS>` — true if any changed file matches `.github/workflows/**` or `.github/actions/**` (composite or local actions). Fires `ci-security`.
- `<HAS_RELEASE>` — true if any changed file matches `.changeset/**`, OR a root / package `package.json` whose `scripts.*publish*` / `scripts.*release*` field is touched, OR any file containing `changeset publish`, `npm publish`, `pnpm publish`, or `gh release create`. Fires `release-integrity`.
- `<HAS_DEPS>` — true if any changed file matches `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` (any level), `package-lock.json`, or `yarn.lock`. Fires `dependencies`.
- `<HAS_PROTOCOL_SURFACE>` — true if any changed file or changed hunk touches protocol-facing SDK code or terms listed in the protocol source-of-truth section above. This flag does not gate `morpho-protocol` (baseline); it tells all agents whether protocol context should have been collected.

Add new flags here when introducing future conditional personas. Each `kind: conditional` persona file declares its `trigger:` placeholder in frontmatter; Step 5 launches it only when the flag is true.

After discovery, **print** the list of files read AND the flag values so the user can spot omissions:

```
Context files read (N):
  AGENTS.md (root)
  MISSION.md
  packages/morpho-sdk/AGENTS.md
  packages/morpho-sdk/src/actions/AGENTS.md
  ...

Flags:
  HAS_WORKFLOWS:       <true|false>
  HAS_RELEASE:         <true|false>
  HAS_DEPS:            <true|false>
  HAS_PROTOCOL_SURFACE:<true|false>
```

## Step 5: Launch parallel review agents

Persona specs live in `.agents/pr-review-engine/agents/*.md`. Each file has frontmatter declaring `kind: baseline` (always fires) or `kind: conditional` (fires only when its `trigger:` flag is true), plus the prompt body.

Loop:

1. Read every file in `.agents/pr-review-engine/agents/*.md`.
2. For each persona, decide whether to launch:
   - `kind: baseline` → always launch.
   - `kind: conditional` → launch only when the flag named in `trigger:` is true (see Step 4 for flag computation).
3. **Apply the caller's exclusion list.** If the caller passed `<EXCLUDE_AGENTS>` (a list of persona names, defaults to `[]`), drop those personas from the launch set. Used by orchestrators that want to suppress a specific agent during inner iterations and run it once explicitly at the end.
4. Launch ALL remaining selected personas **in parallel** using the Agent tool (subagent_type: `"general-purpose"`).
5. Track `<TOTAL_AGENTS_LAUNCHED>` = count of personas actually launched (baseline + any fired conditionals − excluded).

Shared per-agent contract (applied uniformly to every launched persona):

- Each agent receives: full diff, full content of changed files (read from local FS), `<PROJECT_CONTEXT>` from Step 4, the conditional flag values, `<CHANGED_LINES>` (the JSON map produced in Step 3), the persona file body, the repo path / branches. `<CHANGED_LINES>` is the **authoritative** record of which lines the diff added — agents that emit a `line:` field outside that set (beyond the ±15 adjacent-code tolerance, see [`.agents/pr-review-engine/references/calibration.md`](./references/calibration.md)) will see their findings dropped in Step 6.
- When `<HAS_PROTOCOL_SURFACE>` is true, `<PROJECT_CONTEXT>` must include the targeted ABI/address/constant/routing excerpts from Step 4's protocol source-of-truth section, or an explicit note that no relevant source excerpt was found.
- Per-package `AGENTS.md` rules refine the root for the specific package; the root wins on contradictions.
- Agents must analyze the **full diff**, not just the latest commit.
- Each agent **must return** a JSON array `[{severity: "critical"|"high"|"medium"|"low", file: "path", line: number, description: "WHAT: ... FIX: ..."}]` OR an explicit error sentinel `{"agent_error": "<reason>"}` if it could not complete (the aggregator in Step 6 distinguishes "no findings" from "agent failed").
- **`description` schema (load-bearing).** Every finding's `description` MUST contain both a `WHAT:` clause naming the specific problem AND a `FIX:` clause stating the specific change. Recommended format: `WHAT: <one sentence>. FIX: <one sentence>.` Free-form prose otherwise. Findings whose `description` lacks either clause are routed to `failed[]` in Step 6 sub-step 2 and counted toward `<FAILED_AGENTS>` — they are NOT silently dropped, but they DO flag the agent as partially malformed in the caller's report. The schema is validated by [`validate-findings.ts`](./scripts/validate-findings.ts); see kept + dropped calibration examples in [`.agents/pr-review-engine/references/calibration.md`](./references/calibration.md).
- **`line` schema.** `line` must be a positive integer pointing inside `<CHANGED_LINES>` for the cited `file`, or within ±15 lines of one. Findings outside the window are dropped in Step 6 sub-step 1 with `drop_reason: line_pre_existing` and `distance_to_nearest_changed_line`. The tolerance window is a fixed engine constant (see [`.agents/pr-review-engine/references/calibration.md`](./references/calibration.md)).
- **Stay in scope (avoid scope creep).** Focus on the diff: flag issues introduced by these changes, and issues in adjacent code only when the diff makes that adjacent code materially worse (e.g. a renamed function whose remaining callers now misbehave, a new code path that exposes an existing bug). Do NOT flag pre-existing issues in unchanged lines of changed files, propose unrelated refactors, suggest new features or abstractions, or recommend cleanups outside the PR's intent. When in doubt, omit — the reviewer is reviewing *this change*, not the file's history.
- **Don't nitpick.** Polish, wording, naming preferences, stylistic alternatives, and "you could also" suggestions are not findings — omit them regardless of severity label. A Low-severity finding belongs in the output only when a reasonable reviewer would clearly act on it in this PR.
- Only **actionable** findings — no praise, no summaries.

### Current persona inventory

Baseline (always fire):

- `code-quality.md` — type safety, code smells, naming, cross-file impact on SDK consumers, security primitives.
- `module-api-architecture.md` — package boundaries, public surface, NodeNext import discipline.
- `morpho-protocol.md` — Morpho protocol semantics, ABI/address source-of-truth drift, operation routing, accounting/share-price/LLTV invariants.
- `web3-security.md` — contract interactions, transaction params, permit flows, race conditions.
- `silent-failure-hunter.md` — swallowed errors, missing error states, dead code paths.
- `style-conventions.md` — Biome compliance, import discipline, changeset relevance.
- `documentation.md` — JSDoc on public exports per `docs/jsdoc-style.md`, plus Markdown doc accuracy, pointer/link integrity, and AGENTS.md ↔ persona backlink consistency.
- `test-coverage.md` — missing tests for new code paths and onchain interactions.

Conditional:

- `ci-security.md` — fires when `<HAS_WORKFLOWS>` is true. Workflow injection, `pull_request_target` + PR-head checkout, ACL-gated comment triggers, action pinning, `permissions:` scopes, secret exposure.
- `release-integrity.md` — fires when `<HAS_RELEASE>` is true. Publish-flow integrity (`--provenance`, org tokens, tag scope), release-commit signing & write-token hardening, Changesets / release-bot wiring.
- `dependencies.md` — fires when `<HAS_DEPS>` is true. Lockfile drift, new-dep hygiene (`postinstall`, typosquats, unpinned ranges), `.npmrc` and `pnpm-workspace.yaml` hardening.

Adding a new persona = drop a new file under `.agents/pr-review-engine/agents/` with appropriate frontmatter. If conditional, also extend Step 4's flag detection. No edit to caller files needed.

## Step 6: Aggregate and deduplicate findings

Merge all agent results into a single list:

1. **Scope filter + schema validation (deterministic).** Collect every agent's findings into a single JSON array file (e.g. `/tmp/pr-review-findings.json`), then run the bundled validator:

   ```bash
   node .agents/pr-review-engine/scripts/validate-findings.ts \
     /tmp/pr-review-findings.json \
     /tmp/pr-review-changed-lines.json \
     "$(git rev-parse --show-toplevel)" \
     > /tmp/pr-review-filtered.json
   ```

   The validator applies four checks in this order (see [`.agents/pr-review-engine/references/scope-filter.md`](./references/scope-filter.md) for the rationale):

   1. **Schema check** — `severity` ∈ `critical|high|medium|low`, `file` is a non-empty string, `line` is a positive integer, `description` is non-empty AND contains both a `WHAT:` substring and a `FIX:` substring. Schema failures route to `failed[]` and feed `<FAILED_AGENTS>` (see sub-step 2).
   2. **File-out-of-scope** — `file` not present in `<CHANGED_LINES>` (after path normalization: strip `./`, strip `a/` and `b/` diff prefixes; see [`.agents/pr-review-engine/references/scope-filter.md`](./references/scope-filter.md) for the full rule). Drops to `dropped[]` with `drop_reason: file_out_of_scope`.
   3. **Line-pre-existing** — `file` in scope, but `line` is outside the ±15 tolerance window around any changed line. Drops to `dropped[]` with `drop_reason: line_pre_existing` and `distance_to_nearest_changed_line`. Pure renames (empty `CHANGED_LINES` for a file) short-circuit this filter — see [`.agents/pr-review-engine/references/changed-lines.md`](./references/changed-lines.md).
   4. **Markdown documentation-example** — `.md` file, `line` inside a CommonMark fenced code block (` ``` ` / `~~~`). Drops to `dropped[]` with `drop_reason: doc_example_fp`. Detection rule lives in [`.agents/pr-review-engine/references/scope-filter.md`](./references/scope-filter.md).

   The validator emits `{ kept, dropped, failed, counts }` on stdout. The kept array is what feeds sub-step 3's deduplication; `dropped` flows to the caller's audit-trail rendering (Phase 3 adds `<DROPPED_FINDINGS>` to the output contract).

   After the validator returns, print one summary line per non-zero counter:

   ```
   Scope filter: dropped N file-level + N line-level + N doc-example finding(s).
   ```

   Note: schema failures (`failed[]`) count toward `<FAILED_AGENTS>` (sub-step 2); scope drops do NOT.

2. **Count agent failures.** An agent counts as failed if any of these hold:
   - Returned `{"agent_error": "..."}` (the explicit sentinel from Step 5).
   - Returned text that is not parseable as JSON.
   - Returned a JSON value that is not an array (e.g. an object that is not the error sentinel).
   - Returned an array containing one or more findings that landed in `failed[]` from sub-step 1's validator — i.e. wrong `severity`, missing/non-string `file`, non-positive-integer `line`, empty `description`, OR missing `WHAT:` / `FIX:` clause. Count the agent as **partially failed**: keep the valid findings from that agent, but include the agent in `<FAILED_AGENTS>` so the report flags it.

   Track `<FAILED_AGENTS>` as a count plus the names. This count flows into the caller's Step 7 reporting so a "no findings" verdict is never reported when some agents crashed.

3. **Deduplicate** with this rule (do NOT collapse genuinely distinct findings):
   - Findings on the SAME file at the EXACT same line are duplicates ONLY when their descriptions overlap meaningfully (≥50% token overlap, or one is a clear paraphrase of the other). Keep the one with the higher severity; if descriptions don't overlap, keep BOTH (e.g. one agent flags missing JSDoc on line 42, another flags swallowed catch on line 42 — both stay).
   - Findings within ±3 lines but on the same file are merged ONLY when severities AND descriptions overlap.
   - When merging, keep the higher-severity finding's text.

4. Sort by: file path (alphabetical, ASC), then line number (ASC), then severity (DESC).

Severity labels (used everywhere downstream):

- `critical` → Critical
- `high` → High
- `medium` → Medium
- `low` → Low

## Output contract (returned to caller)

The caller (Step 7 of `/pr-review-ci` / `/pr-review-gh` / `/pr-review-local`) consumes:

- `<FINDINGS>` — sorted, deduplicated array of `{severity, file, line, description}` (the validator's `kept[]`, post-dedup).
- `<DROPPED_FINDINGS>` — findings the scope filter dropped, each tagged with `drop_reason` (`file_out_of_scope` / `line_pre_existing` / `doc_example_fp`) and, for line-level drops, `distance_to_nearest_changed_line`. The caller surfaces this as a collapsible audit section so filter false-positives are never silently nuked. See `pr-review-gh.md` Step 7 for the GitHub-comment rendering and `pr-review-local.md` Step 7 for the terminal rendering. `pr-review-ci.md` writes this to `/tmp/` only — the formal GitHub review body stays tight (verdict + actionable findings).
- `<FAILED_AGENTS>` — count + names of agents that returned `agent_error` OR whose findings landed in the validator's `failed[]` bucket (malformed shape OR missing `WHAT:`/`FIX:` clauses). The audit trail surfaces *which* finding malformed *which* agent so the user can see why.
- `<COUNTS>` — `{critical, high, medium, low}` totals on the kept findings.
- `<DROPPED_COUNTS>` — `{file_out_of_scope, line_pre_existing, doc_example_fp}` totals on the dropped findings. Caller skills use this to size the audit-trail block (omitted entirely when all three are zero).
- `<TOTAL_AGENTS_LAUNCHED>` — count of personas that actually fired (baseline always-fire count + any conditional personas whose trigger flag was true). Used by the caller's report to phrase "<FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed" correctly when conditional personas did not fire.

The caller formats and routes these per its mode (CI verdict / GitHub COMMENT / terminal output).

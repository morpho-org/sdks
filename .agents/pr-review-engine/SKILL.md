---
name: pr-review-engine
internal: true
description: Shared multi-lens review dispatcher. Invoked indirectly by the /pr-review-* commands and /pr-fix, never directly. Walks agents/, decides which apply via flags, fans out one sub-agent per match, aggregates findings. Supersedes the previous lib/pr-review-base.md dispatcher.
---

# pr-review-engine — shared multi-lens review dispatcher

This file is the shared review engine for the `/pr-review-ci`, `/pr-review-gh`, `/pr-review-local`, and `/pr-fix` slash commands. It supersedes the previous shared dispatcher at `.agents/lib/pr-review-base.md`.

**Do NOT invoke this file directly.** It is consumed by other commands — it is not symlinked into `.claude/commands/` and assumes the caller has resolved branches and head SHA in its own Steps 1–2. Callers hand control to this file's Steps 3–6.

The base contract: callers pass these resolved values into Steps 3–6 and consume the deduplicated findings list + `<FAILED_AGENTS>` count produced by Step 6.

> **Runtime requirement.** The bundled scripts under `scripts/` are run as `node .agents/pr-review-engine/scripts/<file>.ts` and rely on Node's native TypeScript type-stripping (**Node ≥ 22.18**; the repo's dev/CI runtime is newer). This is a requirement of the review tooling only — it is not the published-package Node floor (`engines.node` in the root `package.json`).

## Success criteria

How a caller knows the engine is working (rough targets, not hard thresholds):

- **Triggering precision** — CI/release-only diffs fire `ci-release-security`; protocol-surface diffs collect ABI/address context for `morpho-protocol` and `web3-security`; agentic-system diffs fire `skill-authoring`.
- **False-positive ceiling** — ≤ 10% of agent findings dropped by the scope filter on a healthy diff. If consistently higher, the diff path normalization or `<CHANGED_LINES>` build is wrong.
- **0 failed agents on a clean diff** — `<FAILED_AGENTS>` is empty when every agent's JSON parses and matches the WHAT/FIX schema. If non-zero, check schema injection in Step 5.
- **Bounded cost** — a typical review fans out 8 baseline + 0–2 conditional agents.

## Inputs (from caller's Steps 1–2)

| Caller-provided | Source |
|---|---|
| `<OWNER>`, `<REPO>` | parsed from git remote |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` (PR modes) OR `git branch --show-current` (Local-only) |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` (PR modes) OR `--local` arg / auto-detected default branch |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid` (PR modes) OR `git rev-parse HEAD` (Local-only) |
| `<DIFF_SOURCE>` | `pr` (use `origin/<BASE_BRANCH>...origin/<HEAD_BRANCH>`) OR `local` (use `origin/<BASE_BRANCH>...HEAD` and overlay uncommitted) |
| `<HEAD_REF>` | `origin/<HEAD_BRANCH>` for `<DIFF_SOURCE>=pr`, `HEAD` for `<DIFF_SOURCE>=local` |
| `<EXCLUDE_AGENTS>` | Optional list of agent names to skip in Step 5 (e.g. `["documentation"]` from `/pr-review-local --fast`). Defaults to empty. |
| `<INTENT_CONTEXT>` | Optional caller-supplied intent/history block — changed-commit messages, and (when the caller talks to GitHub) the PR title+body. Injected into the Step 5 envelope between items 6 and 7. Empty by default; callers that can't reach the data omit it. |

## Step 3: Get the diff locally

**Use the local repo on disk, NOT the GitHub API.**

Compute the merge-base and the diff:

```bash
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> <HEAD_REF>)
# <HEAD_REF> is origin/<HEAD_BRANCH> for <DIFF_SOURCE>=pr, or HEAD for <DIFF_SOURCE>=local

git diff $MERGE_BASE..<HEAD_REF>
git diff --name-only $MERGE_BASE..<HEAD_REF>
```

**Recompute + report the merge-base every run.** `<MERGE_BASE>` is recomputed from `origin/<BASE_BRANCH>` on each run, so a base-branch merge into the PR branch does **not** inflate the diff — the review stays scoped to the true PR delta `merge-base..HEAD`, never a naive `last-reviewed..HEAD` (which balloons with merged-in upstream). Report the scope so it's visible:

> `Review scope: <N> file(s), <MERGE_BASE_SHORT>..<HEAD_REF_SHORT>.`

Then detect base-branch merges in the range and warn — their conflict resolutions surface as PR-authored changes:

```bash
MERGES_IN_RANGE=$(git rev-list --merges --count "$MERGE_BASE..<HEAD_REF>")
```

If `MERGES_IN_RANGE` > 0, print one line:

> `WARNING: <N> merge commit(s) in the review range. The diff is scoped to the recomputed merge-base, so cleanly-merged upstream is excluded — but conflict resolutions appear as PR changes. For a PR-authored-only commit view: git log --first-parent $MERGE_BASE..<HEAD_REF>.`

This is **informational** — it never changes the review scope.

Build `<CHANGED_LINES>` as a map `{ "<file-path>": <sorted-int-set> }` by parsing the `--unified=0` hunk headers. The deterministic implementation ships as a bundled script — prefer it over re-implementing the parser by hand:

```bash
node .agents/pr-review-engine/scripts/build-changed-lines.ts \
  --base "$MERGE_BASE" --head "<HEAD_REF>" > /tmp/changed-lines.json
```

Edge-case handling (deletion-only hunks, pure renames) lives in `references/changed-lines.md`. Read it before adjusting the build rule.

If `<DIFF_SOURCE>=local` AND uncommitted changes exist, also include them (add `--include-uncommitted` to the build script so the map covers them too):

```bash
git diff HEAD                  # combined staged + unstaged
git diff --name-only HEAD
node .agents/pr-review-engine/scripts/build-changed-lines.ts \
  --base "$MERGE_BASE" --head HEAD --include-uncommitted > /tmp/changed-lines.json
```

Combine the two file lists, deduplicate, announce the count of uncommitted files included:

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
6. `SECURITY.md` — security policy. Read if any security-relevant code is touched (auth, crypto, parsers, network entry points, secrets handling, onchain contract calls, wallet operations, CI / publish flow).
7. `docs/tibs/TEMPLATE.md` — read if a doc/TIB-style file is touched.

### Per-package context (only for packages touched by the diff)

For each unique package directory among the changed files (e.g. a file at `packages/morpho-sdk/src/actions/foo.ts` belongs to package `packages/morpho-sdk`), read:

1. `packages/<pkg>/AGENTS.md` — package-specific refinements (refines the root for this package; root wins on contradictions).
2. `packages/<pkg>/README.md` — public-facing description.
3. `packages/<pkg>/ARCHITECTURE.md` — if present.
4. Any other top-level `*.md` in the package (e.g. `packages/morpho-sdk/BUNDLER3.md`).
5. Nested `AGENTS.md` along the path of touched files (at any depth — e.g. `packages/morpho-sdk/src/actions/AGENTS.md`).

Use the Glob tool: `**/AGENTS.md` and `packages/*/*.md`. Filter to paths that prefix at least one changed file's directory.

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

Compute flags from the changed-files list and content. These flags are passed to every agent; flags for `kind: conditional` agents also drive whether they launch in Step 5.

**Doc files are prose, not surfaces:** content-based detector legs (import / string / pattern matches) never count matches found inside `*.md` / `*.mdx` / `*.txt` files — a documented example command must not launch an agent whose own scope rules will predictably return `[]`. Path-based legs (file-path patterns) are unaffected.

- `<HAS_CI_RELEASE>` — true if any changed file matches `.github/workflows/**`, `.github/actions/**`, `.changeset/**`, root or package `package.json` (when a `scripts.*publish*` / `scripts.*release*` field is touched), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, OR if any changed file contains `changeset publish`, `npm publish`, `pnpm publish`, or `gh release create`. **Fires `ci-release-security`.**
- `<HAS_PLUGIN_SKILLS>` — true if any changed file is part of the repo's agentic-system / skill-authoring surface: matches `.agents/**/*.md`, `.agents/pr-review-engine/scripts/**`, `.claude/**`, any `**/SKILL.md`, or a `.claude-plugin/*.json` manifest. Path-based (these are prose/JSON), so it fires even on a docs-only change to the agentic system — exactly when authoring conformance matters. **Fires `skill-authoring`.**
- `<HAS_PROTOCOL_SURFACE>` — true if any changed file or changed hunk touches protocol-facing SDK code or terms listed in the protocol source-of-truth section above. This flag does not gate `morpho-protocol` (baseline); it tells all agents whether protocol context should have been collected.

Add new flags here when introducing future conditional personas. Each `kind: conditional` agent declares its `trigger:` placeholder in frontmatter; Step 5 launches it only when the flag is true.

### Print discovery

After context discovery, **print** the list of files read AND the flag values so the user can spot omissions:

```
Context files read (N):
  AGENTS.md (root)
  MISSION.md
  packages/morpho-sdk/AGENTS.md
  packages/morpho-sdk/src/actions/AGENTS.md
  ...

Flags:
  HAS_CI_RELEASE:      <true|false>
  HAS_PLUGIN_SKILLS:   <true|false>
  HAS_PROTOCOL_SURFACE: <true|false>
```

## Step 5: Launch parallel review agents

Agent specs live in `.agents/pr-review-engine/agents/*.md`. Each file has frontmatter declaring `kind: baseline` (always fires) or `kind: conditional` (fires only when its `trigger:` flag is true), plus the prompt body.

### Loop

1. Read every file in `.agents/pr-review-engine/agents/*.md`.
2. For each agent, decide whether to launch:
   - `kind: baseline` → always launch.
   - `kind: conditional` → parse the `trigger:` value, look up the named flag from Step 4, evaluate it. Compound triggers like `HAS_A OR HAS_B` are evaluated as written (split on whitespace, look up each flag, apply `OR` / `AND`).
3. **Apply the caller's exclusion list.** If the caller provided `<EXCLUDE_AGENTS>`, drop those from the launch set (e.g. `/pr-review-local --fast` excludes `documentation`).
3b. **Doc-only fast path.** If every changed file is `*.md` / `*.mdx` / `*.txt`, drop `silent-failure-hunter`, `test-coverage`, and `web3-security` from the launch set — they have no surface on a docs-only diff and only add cost and noise. `documentation`, `code-quality`, `morpho-protocol`, `module-api-architecture`, and `style-conventions` still launch (prose accuracy, protocol-doc claims, secrets-in-docs, pointer integrity, changeset relevance). Conditionals need no special handling — Step 4's content-based detectors already ignore matches inside doc files, so on a doc-only diff only path-based triggers (`HAS_CI_RELEASE`, `HAS_PLUGIN_SKILLS`) can fire. Print one line: `Doc-only diff: skipping silent-failure-hunter, test-coverage, web3-security.`
4. Launch ALL selected agents **in parallel** using the Agent tool (subagent_type: `"general-purpose"`).
5. Track `<TOTAL_AGENTS_LAUNCHED>` = count of agents actually launched (baseline + fired conditionals − excluded).

### Sub-agent prompt envelope (what the dispatcher must inject)

For every spawned sub-agent, the dispatcher **must** assemble the launch prompt from the following parts, in this order:

1. The agent file body, verbatim (its frontmatter + Markdown prose).
2. `<PROJECT_CONTEXT>` from Step 4 (root + per-package docs, lint contract, protocol excerpts).
3. The diff in full (committed + uncommitted when `<DIFF_SOURCE>=local`). **Exception — lockfiles and generated artifacts** (same list as item 4): their hunks go only to the `ci-release-security` agent; every other agent gets a one-line note per file (`<path>: hunks omitted — lockfile/generated`).
4. The full content of changed files (read from local FS via the Read tool). **Exception — lockfiles and generated artifacts** (`pnpm-lock.yaml`, `*.min.js`, `*.map`, generated `src/api/sdk.ts`, anything under `lib/`): never inject their full content into any agent.
5. The conditional flag values (`HAS_CI_RELEASE`, `HAS_PLUGIN_SKILLS`, `HAS_PROTOCOL_SURFACE`).
6. `<CHANGED_LINES>` serialized as JSON: `{ "<path>": [<line>, <line>, ...] }`.
7. **The "Shared per-agent contract" bullets below, copied verbatim into the prompt.** Without this injection, agents won't know to emit the schema and Step 6.2 will route every finding as malformed.
8. **The calibration example pair** (the kept-finding + dropped-finding pair below), copied verbatim. Anchors the agent's output shape.

**Caller-supplied `<INTENT_CONTEXT>` (item 6b).** When the caller passes `<INTENT_CONTEXT>`, inject it verbatim here, between items 6 and 7, under a `## Intent / history` heading. It carries the changed-commit messages and — for GitHub-aware callers — the PR title+body. Its purpose is to let an agent distinguish a deliberate, documented change from a regression before it rates one. Omit the block entirely when `<INTENT_CONTEXT>` is empty.

**Ordering rule:** any extra caller-supplied context (`<INTENT_CONTEXT>`, iteration history) goes between items 6 and 7 — items 7–8 must be the **final** content of the prompt. Agents given verification-style context narrate their answer unless the output contract is the last instruction they read.

The dispatcher should NOT paraphrase or summarize these parts — copy them.

### Shared per-agent contract (applied uniformly to every launched agent)

- Each agent receives: full diff, full content of changed files, `<PROJECT_CONTEXT>` from Step 4, the conditional flag values, `<CHANGED_LINES>`, the agent file body, the repo path / branches.
- When `<HAS_PROTOCOL_SURFACE>` is true, `<PROJECT_CONTEXT>` must include the targeted ABI/address/constant/routing excerpts from Step 4, or an explicit note that no relevant source excerpt was found.
- Per-package `AGENTS.md` rules refine the root for the specific package; the root wins on contradictions.
- Agents must analyze the **full diff**, not just the latest commit.
- Each agent **must return** a JSON array `[{severity: "critical"|"high"|"medium"|"low", file: "path", line: number, description: "WHAT: ... FIX: ..."}]` OR an explicit error sentinel `{"agent_error": "<reason>"}` if it could not complete.
- **`description` schema.** Every finding's `description` MUST contain both a `WHAT:` clause naming the specific problem AND a `FIX:` clause stating the specific change. Recommended format: `WHAT: <one sentence>. FIX: <one sentence>.` Findings without both clauses are rejected as malformed in Step 6 sub-step 2.
- **`line` schema.** `line` must be a positive integer pointing at a line inside `<CHANGED_LINES>` for the cited `file`, OR within ±15 lines of one (the "adjacent code" tolerance window). Findings outside the window are dropped in Step 6 sub-step 1 as pre-existing. See `references/calibration.md` for the rationale behind ±15.
- **Stay in scope (avoid scope creep).** Focus on the diff: flag issues introduced by these changes, and issues in adjacent code only when the diff makes that adjacent code materially worse. Do NOT flag pre-existing issues, propose unrelated refactors, suggest new features, or recommend cleanups outside the PR's intent. When in doubt, omit.
- **Don't nitpick.** Polish, wording, naming preferences, stylistic alternatives, and "you could also" suggestions are not findings — omit them regardless of severity label.
- **Intentional changes aren't defects.** When `<INTENT_CONTEXT>` shows a change is deliberate, do not flag it as a finding unless the change itself is wrong. Verify intent against the provided commit messages before rating a removal as lost coverage or a behaviour change as a regression.
- Only **actionable** findings — no praise, no summaries.

#### Calibration examples (apply to every agent)

A finding that would be **kept** (good shape):

```json
{
  "severity": "high",
  "file": "packages/morpho-sdk/src/actions/borrow.ts",
  "line": 42,
  "description": "WHAT: the borrow amount is compared against the raw LLTV without subtracting the safety buffer, so a borrow at exactly LLTV passes the guard and the position is immediately liquidatable. FIX: compare against `lltv - LLTV_BUFFER` and throw `BorrowExceedsSafeLtvError` when it exceeds the safe maximum."
}
```

This is kept because the `WHAT` clause names a specific problem at a specific line, the `FIX` clause is a concrete code change, the severity matches the risk (silent liquidatable position → high), and the cited line is inside `<CHANGED_LINES>`.

A finding that would be **dropped** in Step 6 (bad shape):

```json
{
  "severity": "medium",
  "file": "packages/morpho-sdk/src/actions/borrow.ts",
  "line": 42,
  "description": "Consider extracting this into a helper for readability."
}
```

This is dropped because: no `WHAT:` clause naming the specific problem, no `FIX:` clause stating the specific change, and the underlying suggestion is a stylistic preference — a textbook nitpick the master scope-guard prohibits.

### Current agent inventory

Baseline (always fire, 8 agents):

- `code-quality.md` — type safety, code smells, naming, cross-file impact on SDK consumers, security primitives.
- `module-api-architecture.md` — package boundaries, public surface, NodeNext import discipline.
- `morpho-protocol.md` — Morpho protocol semantics, ABI/address source-of-truth drift, operation routing, accounting/share-price/LLTV invariants.
- `web3-security.md` — contract interactions, transaction params, permit flows, race conditions.
- `silent-failure-hunter.md` — swallowed errors, missing error states, dead code paths.
- `style-conventions.md` — Biome compliance, import discipline, changeset relevance.
- `documentation.md` — JSDoc on public exports per `docs/jsdoc-style.md`, plus Markdown doc accuracy, pointer/link integrity, and AGENTS.md ↔ persona backlink consistency.
- `test-coverage.md` — missing tests for new code paths and onchain interactions.

Conditional (fire only when their trigger flag is true, 2 agents):

- `ci-release-security.md` — fires when `<HAS_CI_RELEASE>`. Workflow injection, action pinning, permissions scopes, secret exposure, publish-flow integrity, lockfile drift.
- `skill-authoring.md` — fires when `<HAS_PLUGIN_SKILLS>`. Reviews the repo's own agentic-system authoring conformance against `references/skill-authoring.md` + the repo's conventions: the engine ↔ agents ↔ §10 inventory invariants, persona frontmatter contract, deterministic-script discipline, and pointer integrity within `.agents/`.

The dispatcher does not hardcode names for discovery — it walks `agents/` (the doc-only fast path's skip list in Step 5.3b is the one deliberate name-based exception). Total: 10 agents (8 baseline + 2 conditional).

Adding a new agent = drop a new file under `.agents/pr-review-engine/agents/` with appropriate frontmatter. If conditional, also extend Step 4's flag detection. No edit to caller files needed.

## Step 6: Aggregate and deduplicate findings

Merge all agent results into a single list:

1. **Scope filter (drop out-of-scope findings).** Build `<CHANGED_FILES>` = the deduplicated file list from Step 3:
   - committed: `git diff --name-only $MERGE_BASE..<HEAD_REF>`
   - plus uncommitted: `git diff --name-only HEAD` (only when `<DIFF_SOURCE>=local`)

   For every agent finding, first guard `finding.file`: if it is missing, not a string, or empty, treat the finding as malformed and route it to sub-step 2's partial-failure handling instead of dropping it here. Otherwise, compare `finding.file` against `<CHANGED_FILES>` after path normalization (strip leading `./`, strip diff prefixes `a/` and `b/`, strip the repo-root prefix on absolute paths; case-sensitive compare to match git's default).

   If `finding.file` is not in `<CHANGED_FILES>`, **drop the finding** and increment `<DROPPED_OUT_OF_SCOPE>`.

   **Line-level scope filter (in-file).** For findings whose `file` IS in `<CHANGED_FILES>`, check `finding.line` against the file's `<CHANGED_LINES>` set built in Step 3. **Short-circuit:** if the file's set is empty (pure rename), skip the line-level filter for that file entirely. Otherwise:
   - If `finding.line` is in the set → keep.
   - If `finding.line` is outside the set but within ±15 lines of any changed line → keep (adjacent-code tolerance).
   - Otherwise → **drop** and increment `<DROPPED_PRE_EXISTING>`. The finding is tagged with `distance_to_nearest_changed_line` for audit purposes.

   Each kept finding is tagged with `snapped_line` — the nearest actual diff line (equal to `line` when the cited line is itself changed; the matched changed line when it sat within tolerance). A GitHub inline comment must anchor on `snapped_line`, because the reviews API rejects any comment whose line is not an exact diff line. Pure-rename keeps carry no `snapped_line`.

   The deterministic implementation of the line-level filter, the markdown documentation-example filter, and the `snapped_line` tagging ships as a script — prefer it over re-deriving the line math by hand:

   ```bash
   node .agents/pr-review-engine/scripts/validate-findings.ts \
     --findings findings.json --changed-lines /tmp/changed-lines.json
   ```

   The script emits the `<DROPPED_OUT_OF_SCOPE>` / `<DROPPED_PRE_EXISTING>` / `<DROPPED_DOC_EXAMPLE>` counters and tags each dropped finding with `drop_reason` plus, for line-level drops, `distance_to_nearest_changed_line`. The full markdown-fence rule lives in `references/scope-filter.md`.

   After all three sub-filters, print one log line per counter that is non-zero:
   `Scope filter: dropped <N> file-level + <N> line-level + <N> doc-example finding(s).`

2. **Count agent failures.** An agent counts as failed if any of these hold:
   - Returned `{"agent_error": "..."}` (the explicit sentinel from Step 5). A sentinel payload is never mined for embedded findings.
   - Returned text from which no findings array can be **safely** recovered. The validator parses tolerantly (a prose-wrapped array is recovered by slicing from the first `[` to the last `]`; an object whose sole value is a list is unwrapped) but rejects ambiguous payloads (incidental brackets, trailing failure objects). The bias is deliberate: a false failure is recoverable, a false clean is not.
   - Returned a JSON value that is not an array and could not be unwrapped.
   - Returned an array containing one or more objects missing required fields:
     - `severity` not in `critical`/`high`/`medium`/`low`
     - missing or non-string `file`
     - missing or non-positive-integer `line`
     - missing or empty `description`
     - `description` lacks a `WHAT:` substring OR lacks a `FIX:` substring
     Count the agent as **partially failed**: keep the valid findings from that agent, but include it in `<FAILED_AGENTS>`.

   Track `<FAILED_AGENTS>` as a count plus the names. This count flows into the caller's Step 7 reporting so a "no findings" verdict is never reported when some agents crashed.

3. **Deduplicate** with this rule (do NOT collapse genuinely distinct findings):
   - Findings on the SAME file at the EXACT same line are duplicates ONLY when their descriptions overlap meaningfully (≥50% token overlap, or one is a clear paraphrase of the other). Keep the higher-severity one; if descriptions don't overlap, keep BOTH.
   - Findings within ±3 lines on the same file are merged ONLY when severities AND descriptions overlap.
   - When merging, keep the higher-severity finding's text.

4. Sort by: file path (alphabetical, ASC), then line number (ASC), then severity (DESC).

Severity labels:

- `critical` → Critical
- `high` → High
- `medium` → Medium
- `low` → Low

## Output contract (returned to caller)

The caller (Step 7 of `/pr-review-ci` / `/pr-review-gh` / `/pr-review-local` / `/pr-fix`) consumes:

- `<FINDINGS>` — sorted, deduplicated array of `{severity, file, line, description, snapped_line?}`. `snapped_line` is the nearest actual diff line (the anchor for a GitHub inline comment; equals `line` when the cited line is itself changed); absent on pure-rename keeps.
- `<DROPPED_FINDINGS>` — findings the scope filter dropped, each tagged with `drop_reason` (`file-out-of-scope` / `line-pre-existing` / `doc-example-fp`). Consumer commands render this as a collapsible audit section after the main findings list — never a silent nuke.
- `<FAILED_AGENTS>` — count + names of agents that returned `agent_error` or malformed output.
- `<COUNTS>` — `{critical, high, medium, low}` totals on the kept findings.
- `<DROPPED_COUNTS>` — `{out_of_scope, pre_existing, doc_example}` totals on the dropped findings.
- `<TOTAL_AGENTS_LAUNCHED>` — count of baseline + fired conditional agents, minus `<EXCLUDE_AGENTS>`.

The caller formats and routes these per its mode (CI verdict / GitHub COMMENT / terminal output / fix application).

**Stateful re-runs (optional, caller-side).** The engine is stateless — it recomputes `<FINDINGS>` from the full diff every run. A caller that wants memory across runs of an evolving PR pipes `<FINDINGS>` through `scripts/findings-ledger.ts`, which merges them into a persisted ledger and returns `net_new` / `recurring` / `resolved` / `suppressed` (wontfix) sets, and serves an idempotency cache. The ledger lives **outside** the repo under review (default `~/.claude/facets/reviews/<owner>-<repo>-<key>.json`, override the dir with `FACETS_LEDGER_DIR`) so it never trips a clean-tree guard. This keeps the functional core (the engine) stateless and confines the I/O to the shell (the consuming command).

## Examples

### Example 1: PR-mode review of a CI-workflow-only change

Caller (`/pr-review-gh`) hands in `<DIFF_SOURCE>=pr`, a single changed file `.github/workflows/release.yml`.

- Step 4 sets `<HAS_CI_RELEASE>=true`; other flags false.
- Step 5 launches: 8 baseline + `ci-release-security` = 9 agents in parallel. `skill-authoring` is skipped.
- Step 6 aggregates; the CI agent typically owns 1–3 high-severity findings on action pinning / `permissions:`.

### Example 2: Local-mode review of a protocol action with uncommitted changes

Caller (`/pr-review-local`) hands in `<DIFF_SOURCE>=local`, 2 committed + 1 uncommitted file under `packages/morpho-sdk/src/actions/`.

- Step 3 unions committed + uncommitted diffs, announces "Including 1 uncommitted file(s) in the review."
- Step 4 sets `<HAS_PROTOCOL_SURFACE>=true` and collects ABI/constant excerpts for `morpho-protocol` + `web3-security`.
- Step 5 fires 8 baseline agents (no conditional flag matched).

### Example 3: Excluding an agent (`--fast`)

Caller (`/pr-review-local --fast`) hands in `<EXCLUDE_AGENTS>=["documentation"]`.

- Step 5.3 drops `documentation` from the launch set (the most expensive lens, most likely clean on code-only diffs).

## Troubleshooting

### Symptom: every finding lands in `<DROPPED_OUT_OF_SCOPE>`

Likely path normalization disagreement. The agent returned absolute paths or paths with an `a/` prefix; the filter compares against git's `--name-only` output (relative, no prefix). Verify the normalization rules in Step 6 sub-step 1. If the diff is a pure rename, see the next symptom.

### Symptom: every finding on a renamed file is dropped

Pure renames produce empty `<CHANGED_LINES>` for the file. The line-level filter is supposed to short-circuit on an empty set — if findings are still being dropped, `scripts/build-changed-lines.ts` may have produced a stale JSON. Delete `/tmp/changed-lines.json` and rerun.

### Symptom: `<FAILED_AGENTS>` is non-empty but findings look fine

The agent returned valid findings but at least one is missing the `WHAT:` or `FIX:` clause. Run `node .agents/pr-review-engine/scripts/validate-findings.ts --findings <agent-output>.json --schema-only` to identify the offending finding. Common cause: the agent file body was not injected via the prompt envelope (Step 5), so the agent never saw the schema rule.

### Symptom: too many findings dropped by the ±15 tolerance window

The window is a fixed engine constant. See `references/calibration.md` for the rationale.

## Bundled scripts

- `scripts/build-changed-lines.ts` — parses `git diff --unified=0` and emits the `<CHANGED_LINES>` JSON map. Handles deletion-only and pure-rename edge cases. Run via `node` (Node ≥ 22.18, native type-stripping).
- `scripts/validate-findings.ts` — applies the WHAT/FIX schema check + ±15 line-window filter + Markdown fenced-block detection. Emits dropped-findings with `drop_reason` + `distance_to_nearest_changed_line`, and tags each kept finding with `snapped_line`. Run via `node`.
- `scripts/findings-ledger.ts` — merges a review's findings into a persisted per-PR/branch ledger and classifies each as net-new / recurring / resolved / suppressed (wontfix). Also serves the **idempotency cache** (`--check-cache --run-hash`). Pure core + injected IO; run by the **caller**, not the engine. Run via `node`.
- `scripts/review-scope.ts` — testable git-scope helpers: `toHttpsUrl` (SSH→HTTPS rewrite for the fetch fallback) and `runHash` (content-based idempotency-cache identity). Run via `node`.
- `scripts/list-fix-rubric-agents.sh` — discovers which agents carry a `## Fix rubric` section. Used by `/pr-fix`'s rubric-loading loop.

These exist so the deterministic logic isn't re-derived from English by every caller, and so a regression fails a `pnpm test` gate instead of riding to production. Their unit tests live alongside them (`*.test.ts`) and run under the `agents-engine` Vitest project.

## References

- `references/changed-lines.md` — deletion-only and pure-rename edge cases for the `<CHANGED_LINES>` build.
- `references/scope-filter.md` — full rule for the Markdown documentation-example filter, including CommonMark fence handling and known limitations.
- `references/calibration.md` — rationale for the ±15 tolerance window and the `distance_to_nearest_changed_line` audit signal.
- `references/secrets.md`, `references/injection.md` — shared rubric content cross-checked by `code-quality`, `web3-security`, and `ci-release-security`.
- `references/github-actions.md` — GitHub Actions hardening rubric for `ci-release-security`.
- `references/skill-authoring.md` — authoring-conformance rubric for `skill-authoring`.

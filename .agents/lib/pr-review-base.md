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

## Step 3: Get the diff locally

**Use the local repo on disk, NOT the GitHub API.**

Compute the merge-base and the diff:

```bash
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> <HEAD_REF>)
# <HEAD_REF> is origin/<HEAD_BRANCH> for <DIFF_SOURCE>=pr, or HEAD for <DIFF_SOURCE>=local

git diff $MERGE_BASE..<HEAD_REF>
git diff --name-only $MERGE_BASE..<HEAD_REF>
```

If `<DIFF_SOURCE>=local` AND uncommitted changes exist, also include them:

```bash
git diff HEAD                  # combined staged + unstaged
git diff --name-only HEAD
```

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

1. `packages/blue-sdk-viem/src/abis.ts` — Morpho Blue, MetaMorpho, VaultV2, factories, PublicAllocator, adapter ABIs, permit ABIs, and liquidation ABIs.
2. `packages/bundler-sdk-viem/src/abis.ts` — bundler3 and adapter ABIs.
3. `packages/blue-sdk/src/constants.ts` and `packages/morpho-sdk/src/helpers/constant.ts` — protocol scales, limits, and fixed constants.
4. `packages/morpho-sdk/AGENTS.md` plus nested `AGENTS.md` such as `packages/morpho-sdk/src/actions/AGENTS.md` — routing, glossary, native wrapping, and reallocation rules.

If no matching ABI/address/constant excerpt is found for a changed protocol call, record that absence in `<PROJECT_CONTEXT>` instead of letting agents infer from memory.

### Detect conditional persona triggers

Compute flags from the changed-files list. These flags are passed to every persona; flags for `kind: conditional` personas also drive whether they launch in Step 5:

- `<HAS_CI_RELEASE>` — true if any changed file matches `.github/workflows/**`, `.github/actions/**`, `.changeset/**`, root or package `package.json` (when a `scripts.*publish*` / `scripts.*release*` field is touched), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, OR if any changed file contains `changeset publish`, `npm publish`, `pnpm publish`, or `gh release create`.
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
  HAS_CI_RELEASE: <true|false>
  HAS_PROTOCOL_SURFACE: <true|false>
```

## Step 5: Launch parallel review agents

Persona specs live in `.agents/personas/*.md`. Each file has frontmatter declaring `kind: baseline` (always fires) or `kind: conditional` (fires only when its `trigger:` flag is true), plus the prompt body.

Loop:

1. Read every file in `.agents/personas/*.md`.
2. For each persona, decide whether to launch:
   - `kind: baseline` → always launch.
   - `kind: conditional` → launch only when the flag named in `trigger:` is true (see Step 4 for flag computation).
3. Launch ALL selected personas **in parallel** using the Agent tool (subagent_type: `"general-purpose"`).
4. Track `<TOTAL_AGENTS_LAUNCHED>` = count of personas actually launched (baseline + any fired conditionals).

Shared per-agent contract (applied uniformly to every launched persona):

- Each agent receives: full diff, full content of changed files (read from local FS), `<PROJECT_CONTEXT>` from Step 4, the conditional flag values, the persona file body, the repo path / branches.
- When `<HAS_PROTOCOL_SURFACE>` is true, `<PROJECT_CONTEXT>` must include the targeted ABI/address/constant/routing excerpts from Step 4's protocol source-of-truth section, or an explicit note that no relevant source excerpt was found.
- Per-package `AGENTS.md` rules refine the root for the specific package; the root wins on contradictions.
- Agents must analyze the **full diff**, not just the latest commit.
- Each agent **must return** a JSON array `[{severity: "critical"|"high"|"medium"|"low", file: "path", line: number, description: "what is wrong + how to fix"}]` OR an explicit error sentinel `{"agent_error": "<reason>"}` if it could not complete (the aggregator in Step 6 distinguishes "no findings" from "agent failed").
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

- `ci-release-security.md` — fires when `<HAS_CI_RELEASE>` is true. Workflow injection, action pinning, permissions scopes, secret exposure, publish-flow integrity, lockfile drift.

Adding a new persona = drop a new file under `.agents/personas/` with appropriate frontmatter. If conditional, also extend Step 4's flag detection. No edit to caller files needed.

## Step 6: Aggregate and deduplicate findings

Merge all agent results into a single list:

1. **Scope filter (drop out-of-scope findings).** Build `<CHANGED_FILES>` = the deduplicated file list from Step 3:
   - committed: `git diff --name-only $MERGE_BASE..<HEAD_REF>`
   - plus uncommitted: `git diff --name-only HEAD` (only when `<DIFF_SOURCE>=local`)

   For every agent finding, first guard `finding.file`: if it is missing, not a string, or empty, treat the finding as malformed and route it to sub-step 2's partial-failure handling instead of dropping it here. Otherwise, compare `finding.file` against `<CHANGED_FILES>` after path normalization:
   - Strip any leading `./`.
   - Strip diff prefixes `a/` and `b/` if present.
   - If the agent returned an absolute path, strip the repo-root prefix (`git rev-parse --show-toplevel`) before compare.
   - Case-sensitive compare (matches git's default).

   If `finding.file` is not in `<CHANGED_FILES>`, **drop the finding** and increment `<DROPPED_OUT_OF_SCOPE>`.

   Do NOT filter by line number within a changed file. The Step 5 contract permits flagging adjacent code in a changed file when the diff materially worsens it, so line-level filtering would discard legitimate findings.

   After the loop, print one log line: `Scope filter: dropped <DROPPED_OUT_OF_SCOPE> finding(s) targeting files outside the diff.` Then proceed to the remaining sub-steps on the surviving findings.

   Note: dropped findings do NOT count toward `<FAILED_AGENTS>` — they are valid output that was simply out of scope, not malformed.

2. **Count agent failures.** An agent counts as failed if any of these hold:
   - Returned `{"agent_error": "..."}` (the explicit sentinel from Step 5).
   - Returned text that is not parseable as JSON.
   - Returned a JSON value that is not an array (e.g. an object that is not the error sentinel).
   - Returned an array containing one or more objects missing required fields (`severity` not in `critical`/`high`/`medium`/`low`, missing or non-string `file`, missing or non-numeric `line`, missing or empty `description`) — count the agent as **partially failed**: keep the valid findings from that agent, but include the agent in `<FAILED_AGENTS>` so the report flags it.

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

- `<FINDINGS>` — sorted, deduplicated array of `{severity, file, line, description}`.
- `<FAILED_AGENTS>` — count + names of agents that returned `agent_error` or malformed output.
- `<COUNTS>` — `{critical, high, medium, low}` totals.
- `<TOTAL_AGENTS_LAUNCHED>` — count of personas that actually fired (baseline always-fire count + any conditional personas whose trigger flag was true). Used by the caller's report to phrase "<FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed" correctly when conditional personas did not fire.

The caller formats and routes these per its mode (CI verdict / GitHub COMMENT / terminal output).

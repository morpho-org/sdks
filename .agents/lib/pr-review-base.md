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

After discovery, **print** the list of files read so the user can spot omissions:

```
Context files read (N):
  AGENTS.md (root)
  MISSION.md
  packages/morpho-sdk/AGENTS.md
  packages/morpho-sdk/src/actions/AGENTS.md
  ...
```

## Step 5: Launch parallel review agents

Launch ALL 7 review agents **in parallel** using the Agent tool (subagent_type: `"general-purpose"`). Shared per-agent contract:

- Each agent receives: full diff, full content of changed files (read from local FS), `<PROJECT_CONTEXT>` from Step 4, the repo path / branches.
- Per-package `AGENTS.md` rules refine the root for the specific package; the root wins on contradictions.
- Agents must analyze the **full diff**, not just the latest commit.
- Each agent **must return** a JSON array `[{severity: "critical"|"high"|"medium"|"low", file: "path", line: number, description: "what is wrong + how to fix"}]` OR an explicit error sentinel `{"agent_error": "<reason>"}` if it could not complete (the aggregator in Step 6 distinguishes "no findings" from "agent failed").
- **Stay in scope (avoid scope creep).** Focus on the diff: flag issues introduced by these changes, and issues in adjacent code only when the diff makes that adjacent code materially worse (e.g. a renamed function whose remaining callers now misbehave, a new code path that exposes an existing bug). Do NOT flag pre-existing issues in unchanged lines of changed files, propose unrelated refactors, suggest new features or abstractions, or recommend cleanups outside the PR's intent. When in doubt, omit — the reviewer is reviewing *this change*, not the file's history.
- Only **actionable** findings — no praise, no summaries.

### Agent 1: Code Quality

Focus: TypeScript strict mode, type safety, early returns, `as` assertions, duplication, naming, code smells, magic numbers, overly complex functions.

Prompt must include:

- Type safety issues (`any`, unsafe `as` assertions, missing generics)
- Error handling and edge cases
- Code smells (duplicated logic, overly complex functions, magic numbers)
- Early returns preferred over nested conditionals
- Naming conventions per the root `AGENTS.md` (and any per-package `AGENTS.md` for the file under review)
- Reference `AGENTS.md` (root, canonical), `MISSION.md`, the package's `AGENTS.md`, and `CONTRIBUTING.md`

**Cross-file impact (critical for an SDK):**
- Changed exports from `packages/<pkg>/src/index.ts` — could break consumer code
- Function signature changes on public APIs (parameter add/remove/reorder/type-narrow)
- Renamed or removed exports
- API contract changes (return type, thrown error type, async-vs-sync)
- New deep imports into other packages (should go through `src/index.ts`)

**Security:**
- Hardcoded secrets, tokens, private keys, RPC URLs with credentials
- Injection risks in any string-templated input (SQL-like queries, shell commands)
- Authentication bypass / authorization checks missing on entry points
- `eval`, `Function(...)` constructors, dynamic `import(<userInput>)` — flag any

### Agent 2: Module & API Architecture

Focus: package boundaries, public surface, type/import discipline, NodeNext compatibility.

Prompt must include:

- Public exports come from `packages/<pkg>/src/index.ts` only — no deep imports into other packages
- Relative imports include `.js` suffix (NodeNext) — e.g. `export * from "./market/index.js"`
- Prefer type-only imports where possible (`import type { Address } from "viem"`)
- Reuse SDK types for protocol values: `Address`, `MarketId`, `ChainId`, `BigIntish`
- `bigint` for onchain quantities and WAD-scaled rates (e.g. `92_0000000000000000n`)
- `as const` and `satisfies` for protocol lists and ABI literals (e.g. `BLUE_OPERATIONS as const`)
- Domain failures are typed `Error` subclasses with readonly inputs
- Edits to generated **inputs** (e.g. `graphql/*.gql`), not generated files (e.g. `src/api/sdk.ts`)
- No edits to build output under `lib/`
- Reference the root `AGENTS.md`, the package's `AGENTS.md` (and any nested `AGENTS.md`), and the package's own `package.json` `exports` field

### Agent 3: Web3 Security

Focus: Contract interactions, transaction parameters, wallet handling, permit flows, race conditions. **This is CRITICAL review territory.**

Prompt must include:

- Contract interactions: verify correct contract addresses, function signatures, and arguments
- Transaction parameters: check gas estimates, value transfers, and calldata encoding
- Reactivity concerns: can state changes cause unintended transaction parameters?
- Wallet connection: proper account handling and chain verification
- Hook usage: correct usage of wagmi hooks (useContractRead, useContractWrite, etc.)
- Error handling: transaction failures, reverts, and user rejections
- Race conditions in async operations
- Missing transaction confirmations or proper waiting for receipts
- Permit/deadline handling (avoid stale block timestamps)

### Agent 4: Silent Failure Hunter

Focus: Swallowed errors, missing error boundaries, empty catch blocks, unhandled promise rejections, missing loading/error states, dead code paths.

Prompt must include:

- Empty or overly broad catch blocks that swallow errors
- Missing error boundaries around async components
- Unhandled promise rejections (missing `.catch()` or try/catch)
- Missing loading states for async operations
- Missing error states for failed data fetches
- Silently ignored return values from critical operations
- Dead code paths that can never execute

### Agent 5: Style & Conventions Compliance

Focus: Biome compliance, import discipline, monorepo conventions.

Prompt must include:

- Biome clean: 2-space indentation, organized imports, no unused imports/variables (`pnpm lint`)
- Type-only imports where possible (`import type { ... }`)
- Relative imports use `.js` suffix in source files (NodeNext)
- No edits to generated files (e.g. `src/api/sdk.ts`) — change generated **inputs** instead
- No edits to build output under `lib/`
- Reuse of SDK types (`Address`, `MarketId`, `ChainId`, `BigIntish`) over local re-declarations
- Reference the root `AGENTS.md`, the package's `AGENTS.md`, and `biome.json`
- Changeset relevance: verify `.changeset/*.md` files are present when the PR changes published package source in a semver-relevant way. Allow patch changesets for JSDoc-only changes to published package source. Flag unnecessary changesets for repo metadata, non-API documentation-only, fixture-only, generated-output-only, or tests-only diffs; flag missing changesets for behavior-affecting published package source changes.

### Agent 6: Documentation Analyzer

Focus: JSDoc/TSDoc on public APIs and types in `packages/<pkg>/src/index.ts` and the files it re-exports.

**Canonical JSDoc rules: `docs/jsdoc-style.md`** (operationalizes AGENTS.md §6 and MISSION.md goal #3 — AI-legibility). Include the contents of `docs/jsdoc-style.md` (or a faithful summary) so reviewers flag deviations from the canonical shape.

Prompt must include:

- The `docs/jsdoc-style.md` checklist (what needs JSDoc, what does not, the required block order, `@param` / `@returns` / `@throws` / `@example` rules, error-message phrasing).
- New or modified public exports re-exported from `packages/<pkg>/src/index.ts` must have JSDoc that conforms to `docs/jsdoc-style.md`.
- Doc comments accurate vs. the implementation (no stale references to renamed args, removed return values, changed throw behavior).
- Public types use semantic names — flag generic `T`, `U`, `Foo` where domain names exist.
- README / package-level doc files updated when the public API changes shape.
- `@example` blocks compile and follow the runnable-recipe shape from the style guide.

### Agent 7: Test Coverage Analyzer

Focus: missing or weak tests in `packages/<pkg>/test/` for changes in `packages/<pkg>/src/`.

Prompt must include:

- New public exports without a corresponding test file under `packages/<pkg>/test/`
- New code paths inside existing exports without test cases (branches, error paths, edge cases like zero/MAX_UINT256/negative bigints)
- Removed or modified public exports without tests updated
- Onchain code paths (any code calling `viem`/`wagmi` actions) — confirm there's at least one test that exercises the path against a fork or mock
- Snapshot or schema tests updated when generated outputs change

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

The caller formats and routes these per its mode (CI verdict / GitHub COMMENT / terminal output).

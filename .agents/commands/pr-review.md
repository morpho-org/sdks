# pr-review

Reviews a GitHub Pull Request using parallel specialized agents, posts findings as inline review comments. Supports CI mode (GitHub Actions) and local mode. Optionally watches for new commits and re-reviews automatically.

## Usage

```
/pr-review <pr-number>
/pr-review <pr-number> --watch
@claude /pr-review
```

## Examples

```
/pr-review 123
/pr-review 456 --watch
@claude /pr-review this PR
```

## Documentation Reference

When reviewing, refer to these project docs as needed:

| Document            | Path                  | Use For                                                |
| ------------------- | --------------------- | ------------------------------------------------------ |
| **Project Context** | `CLAUDE.md`           | Monorepo conventions, naming, type/import discipline   |
| **Contributing**    | `CONTRIBUTING.md`     | Dev setup, package layout, release/changesets flow     |
| **TIB Template**    | `TIB/TIB-template.md` | Format for design docs referenced from PRs             |
| **Biome config**    | `biome.json`          | Style/lint rules enforced on PRs (`pnpm lint`)         |

> **TWO-PHASE SKILL**: Phase 1 (Steps 1-8) does the initial review. Phase 2 (Step 9) creates a continuous watcher via CronCreate if `--watch` was passed. If `--watch` is used, the skill is NOT complete until Step 9's CronCreate call succeeds and you report the job ID to the user.

## Placeholder convention

Throughout this skill, the following placeholders are used consistently:

| Placeholder | Source | Description |
|---|---|---|
| `<owner>` | parsed from git remote | GitHub repo owner |
| `<repo>` | parsed from git remote | GitHub repo name |
| `<PR_NUMBER>` | user argument | Pull request number |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` | PR base branch |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` | PR head branch |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid` | Head commit full SHA |
| `<HEAD_SHA_SHORT>` | first 7 chars of `<HEAD_SHA>` | Head commit short SHA |
| `<REPO_PATH>` | `git rev-parse --show-toplevel` | Absolute path to repo root |
| `<BOT_LOGIN>` | `gh api user --jq '.login'` | Current GitHub user's login |

## Step 1: Detect Environment and Repository

### Environment Detection

Detect your environment to determine the review mode:

- **CI Mode**: If running in GitHub Actions (check for `CI=true` or `GITHUB_ACTIONS=true` environment variable), post review comments directly and submit a formal verdict
- **Local Mode**: If running locally (no CI env vars), use parallel agents and post as `COMMENT` (never auto-approve or request changes)

### Repository Detection

Extract owner and repo from the git remote:

```bash
git remote get-url origin
```

Parse `<owner>` and `<repo>` from the URL (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git` formats). Strip the `.git` suffix.

### Current User Detection

Determine the current GitHub user (needed for watcher SHA tracking):

```bash
BOT_LOGIN=$(gh api user --jq '.login')
```

Store this as `<BOT_LOGIN>` for use in Step 9.

## Step 2: Fetch PR Details

Use local `gh` CLI to get PR metadata:

```bash
gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,headRefOid,state
```

Extract:

- `<BASE_BRANCH>` — the base branch (`baseRefName`)
- `<HEAD_BRANCH>` — the head/PR branch (`headRefName`)
- `<HEAD_SHA>` — the head commit SHA (`headRefOid`)
- `state` — must be `OPEN`

Then fetch the latest remote state:

```bash
git fetch origin
```

If the PR is not open, inform the user and stop.

## Step 3: Get Full PR Diff Locally

**IMPORTANT: Use the local repo on disk, NOT the GitHub API, for reading code and diffs.**

```bash
# Get the merge base between PR head and base branch
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> origin/<HEAD_BRANCH>)

# Full diff of the PR
git diff $MERGE_BASE..origin/<HEAD_BRANCH>

# List of changed files
git diff --name-only $MERGE_BASE..origin/<HEAD_BRANCH>
```

Also read the actual changed files from the local filesystem using the Read tool so agents have full file context (not just diff hunks).

## Step 4: Read Project Guidelines

Before launching review agents, read the key reference documents so you can include relevant criteria in each agent's prompt:

1. Read `CLAUDE.md` and `CONTRIBUTING.md` for monorepo conventions.
2. Read `biome.json` if style/lint findings are likely relevant to the diff.

## Step 5: Launch Parallel Review Agents

Launch ALL 7 review agents **in parallel** using the Agent tool (subagent_type: `"general-purpose"`). Each agent should:

- Receive the full diff AND the full content of changed files (read from local filesystem)
- Be told the repo path, owner, repo name, PR number, base branch, and head branch
- Be instructed to analyze the **full PR diff** (not just latest commit)
- Have access to read local files for additional context (e.g., imports, types, configs)
- Return structured findings as a JSON array: `[{severity: "critical"|"high"|"medium"|"low", file: "path/to/file", line: number, description: "what is wrong and how to fix it"}]`
- Only include **actionable** findings — no praise, no summaries

### Agent 1: Code Quality

Focus: TypeScript strict mode, type safety, early returns, `as` assertions, duplication, naming conventions, code smells, magic numbers, overly complex functions.

Prompt must include:

- Type safety issues (`any`, unsafe `as` assertions, missing generics)
- Error handling and edge cases
- Code smells (duplicated logic, overly complex functions, magic numbers)
- Early returns preferred over nested conditionals
- Naming conventions per `CLAUDE.md`
- Reference `CLAUDE.md` and `CONTRIBUTING.md`

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
- Reference `CLAUDE.md` and the package's own `package.json` `exports` field

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
- Reference `CLAUDE.md` and `biome.json`

### Agent 6: Documentation Analyzer

Focus: JSDoc/TSDoc on public APIs and types in `packages/<pkg>/src/index.ts` and the
files it re-exports.

Prompt must include:

- New or modified public exports (types, functions, classes) have JSDoc/TSDoc with at
  minimum: a one-line summary, `@param` for non-obvious args, `@returns` for non-trivial
  return values, and `@throws` for typed `Error` subclasses
- Doc comments are accurate vs. the implementation (no stale references to renamed args,
  removed return values, changed throw behavior)
- Public types use semantic names — flag generic `T`, `U`, `Foo` where domain names exist
  (e.g. `Address`, `MarketId`)
- README / package-level doc files are updated when the public API changes shape
- Examples in doc comments compile (no obvious type errors in inline `@example` blocks)

### Agent 7: Test Coverage Analyzer

Focus: missing or weak tests in `packages/<pkg>/test/` for changes in `packages/<pkg>/src/`.

Prompt must include:

- New public exports without a corresponding test file under `packages/<pkg>/test/`
- New code paths inside existing exports without test cases (branches, error paths,
  edge cases like zero/MAX_UINT256/negative bigints)
- Removed or modified public exports without tests updated
- Onchain code paths (any code calling `viem`/`wagmi` actions) — confirm there's at
  least one test that exercises the path against a fork or mock
- Snapshot or schema tests updated when generated outputs change

## Step 6: Aggregate and Deduplicate Findings

Merge all agent results into a single list:

1. Deduplicate findings that reference the same file + line (within **3 lines tolerance** — two findings on the same file within 3 lines of each other are treated as duplicates)
2. When duplicates exist, keep the finding with the highest severity
3. Sort by: file path (alphabetical, ASC), then line number (ASC), then severity (DESC)

Map severity levels for display:

- `critical` → 🔴 Critical
- `high` → 🟡 Important
- `medium` → 🔵 Medium
- `low` → 🔵 Minor

---

## Step 7: Post Review (CI Mode)

**Only follow this step if running in CI mode (GitHub Actions).**

### 7a: Build the comments array and submit atomically

Construct a JSON object with all findings. Write it to a PR-specific temp file to avoid collisions with concurrent runs:

```bash
REVIEW_FILE="/tmp/pr-review-<PR_NUMBER>-comments.json"
```

Build the JSON programmatically from the deduplicated findings. The structure must be:

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "<APPROVE or REQUEST_CHANGES>",
  "body": "<REVIEW_BODY>",
  "comments": [
    {
      "path": "<file>",
      "line": <line_number>,
      "side": "RIGHT",
      "body": "**[SEVERITY]** <description>\n\nSuggestion: <how to fix>"
    }
  ]
}
```

Each finding becomes one entry in the `comments` array.

**Choose the appropriate verdict based on findings:**

| Verdict             | When                                              | Event             |
| ------------------- | ------------------------------------------------- | ----------------- |
| **Approve**         | No critical or important issues (minor issues OK) | `APPROVE`         |
| **Request Changes** | Any critical issues, or multiple important issues | `REQUEST_CHANGES` |

The `body` field for CI mode must include the CI markers and the guidelines checklist:

```
<!-- CLAUDE_REVIEW_COMPLETE -->
<!-- CLAUDE_VERDICT:APPROVE -->  <!-- Only include for approvals -->
## Code Review Summary

### Overview
<Brief summary of the PR and overall assessment>

### Findings
- 🔴 Critical: X issues
- 🟡 Important: X issues
- 🔵 Minor: X issues

See inline comments for details.

### Guidelines Compliance
- [ ] Follows TypeScript strict mode
- [ ] Uses early returns over nested conditionals
- [ ] `bigint` for onchain quantities; WAD-scaled where appropriate
- [ ] Reuses SDK types (`Address`, `MarketId`, `ChainId`, `BigIntish`)
- [ ] Type-only imports where possible
- [ ] Relative imports use `.js` suffix (NodeNext)
- [ ] Public APIs explicitly re-exported from `src/index.ts`
- [ ] Domain failures are typed `Error` subclasses
- [ ] Biome clean (`pnpm lint`)

### Verdict
✅ **Approved** - Code looks good!
<!-- OR -->
❌ **Changes Requested** - Please address the issues above.
```

Submit the review and all inline comments in a **single atomic call**:

```bash
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  --input "$REVIEW_FILE"
```

This creates the review and all inline comments atomically — no partial reviews if something fails midway.

Clean up: `rm -f "$REVIEW_FILE"`

**Important notes for CI mode:**

- Always include `<!-- CLAUDE_REVIEW_COMPLETE -->` in every review
- For approvals, also include `<!-- CLAUDE_VERDICT:APPROVE -->` and use `APPROVE` event
- Line numbers must match the NEW file in the diff (right side)
- Use `side: "RIGHT"` for commenting on added/modified lines
- For multi-line suggestions, use `start_line` and `line` parameters in each `comments[]` entry
- If the review creation fails (e.g., permissions, line numbers out of range), fall back to a single PR comment via `gh api repos/<owner>/<repo>/issues/<PR_NUMBER>/comments`

**After posting, skip to Step 8.** CI mode does not use `--watch`.

---

## Step 7 (alt): Post Review (Local Mode)

**Only follow this step if running locally (NOT in CI).**

### 7a: Build the comments array and submit atomically

Construct a JSON object with all findings. Write it to a PR-specific temp file to avoid collisions with concurrent runs:

```bash
REVIEW_FILE="/tmp/pr-review-<PR_NUMBER>-comments.json"
```

Build the JSON programmatically from the deduplicated findings. The structure must be:

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "COMMENT",
  "body": "<REVIEW_BODY>",
  "comments": [
    {
      "path": "<file>",
      "line": <line_number>,
      "side": "RIGHT",
      "body": "**[SEVERITY]** <description>\n\nSuggestion: <how to fix>"
    }
  ]
}
```

Each finding becomes one entry in the `comments` array. Always use `"event": "COMMENT"` in local mode — never auto-approve or request changes.

The `body` field for local mode:

```
## Parallel PR Review (Claude)

**Reviewed commit:** `<HEAD_SHA_SHORT>`

| Severity | Count |
|----------|-------|
| 🔴 Critical | X |
| 🟡 Important | X |
| 🔵 Medium | X |
| 🔵 Minor | X |

_This is an automated parallel review. It will re-run when new commits are pushed (if watching)._
```

Submit the review and all inline comments in a **single atomic call**:

```bash
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  --input "$REVIEW_FILE"
```

Clean up: `rm -f "$REVIEW_FILE"`

**Important**: If the atomic review API call fails (e.g., permissions, line numbers out of range), fall back to posting a single PR-level comment with all findings via `gh api repos/<owner>/<repo>/issues/<PR_NUMBER>/comments`.

If there are zero findings, still submit with an empty `comments` array and a body saying "No issues found in this review."

### 7b: Optional Codex pass

Check if `codex` CLI is available:

```bash
which codex
```

If available, run in the background (do not wait for it to finish):

```bash
codex exec -c model_reasoning_effort=xhigh "Review PR #<PR_NUMBER> in this repo. The PR branch is <HEAD_BRANCH> based on <BASE_BRANCH>. Run 'git diff origin/<BASE_BRANCH>...origin/<HEAD_BRANCH>' to get the full diff. Analyze the changes for bugs, security issues, code quality, and best practices. Post your findings as inline review comments on the PR using 'gh api' to create a pull request review with comments on specific lines." 2>&1 | tail -50
```

If `codex` is not installed or the command fails, log the error and continue — Claude review is sufficient on its own.

---

## Step 8: Report to User

Print a summary:

```
PR #<PR_NUMBER> review posted:
  Claude: <N> findings (X critical, Y important, Z medium, W minor)
  Codex:  <triggered in background / not available>
  Mode:   <CI / Local>
Last reviewed commit: <HEAD_SHA_SHORT>
```

If `--watch` was NOT passed (or in CI mode), the skill is complete here.

If `--watch` WAS passed AND in local mode, **you MUST proceed to Step 9**.

## Step 9: Schedule Continuous Watch (only with --watch, local mode only)

**If `--watch` was passed, you MUST call `CronCreate` now.** Do not skip this step.

Use `CronCreate` to schedule a recurring job every 2 minutes:

- cron: `*/2 * * * *`
- recurring: true
- prompt: The prompt below, with all variables filled in (replace all `<PLACEHOLDERS>` with actual values):

```
You are the PR review watcher for PR #<PR_NUMBER> in <owner>/<repo>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>
Bot login: <BOT_LOGIN>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

CYCLE START:

1. FETCH AND CHECK STATE:
   Run: cd <REPO_PATH> && git fetch origin
   Run: git rev-parse origin/<HEAD_BRANCH>
   Run: gh pr view <PR_NUMBER> --repo <owner>/<repo> --json state --jq '.state'
   If not "OPEN": say "PR #<PR_NUMBER> is no longer open (state: <STATE>). Review watcher done." and end.

2. GET LAST REVIEWED SHA:
   Query the most recent review posted by the bot on this PR (derived at cycle start from GitHub, NOT baked in at CronCreate time):
   Run: gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews?per_page=100 --jq '[.[] | select(.user.login == "<BOT_LOGIN>")] | sort_by(.submitted_at) | last | .commit_id'
   If no review by <BOT_LOGIN> is found, fall back to the most recent review on the PR:
   Run: gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews?per_page=100 --jq 'sort_by(.submitted_at) | last | .commit_id'
   If still no previous review is found, treat LAST_REVIEWED_SHA as empty (review everything).
   Otherwise set LAST_REVIEWED_SHA to the returned commit_id.

3. COMPARE SHA:
   Compare the current head SHA (from step 1) to LAST_REVIEWED_SHA.
   If they are the same: say "No new commits on PR #<PR_NUMBER>, still at <HEAD_SHA_SHORT>." and end this cycle.

4. NEW COMMIT DETECTED:
   Say "New commit detected on PR #<PR_NUMBER>: <HEAD_SHA>. Running full review..."

5. GET FULL PR DIFF:
   Run: cd <REPO_PATH>
   MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> origin/<HEAD_BRANCH>)
   git diff $MERGE_BASE..origin/<HEAD_BRANCH>
   git diff --name-only $MERGE_BASE..origin/<HEAD_BRANCH>
   Also read each changed file from the local filesystem using the Read tool for full context.

6. READ GUIDELINES:
   Read CLAUDE.md and CONTRIBUTING.md for monorepo conventions.

7. LAUNCH REVIEW AGENTS in parallel using the Agent tool (subagent_type: "general-purpose"):
   a. code-quality — TypeScript strict mode, type safety, early returns, assertions, duplication, naming, code smells. ALWAYS include cross-file impact (changed exports from packages/<pkg>/src/index.ts, public API signature changes, renamed/removed exports, new deep imports) and security (hardcoded secrets/RPC URLs, injection risks, auth bypass, eval/Function/dynamic import).
   b. module-architecture — package boundaries, public exports from src/index.ts, type-only imports, .js suffix (NodeNext), reuse of SDK types (Address, MarketId, ChainId, BigIntish), bigint for onchain quantities, as const / satisfies for ABIs
   c. web3-security — contract interactions, tx params, wallets, permits, race conditions (CRITICAL)
   d. silent-failure-hunter — swallowed errors, empty catch blocks, missing error boundaries, unhandled rejections
   e. style-conventions — Biome clean (pnpm lint), import ordering, type-only imports, no edits to lib/ output, edits to generated *inputs* (graphql/*.gql), not generated files
   f. documentation — JSDoc/TSDoc on public APIs in packages/<pkg>/src/index.ts and re-exported files; @param/@returns/@throws coverage; doc accuracy vs. implementation; semantic type names; README updates when public API changes; @example blocks compile.
   g. test-coverage — missing tests in packages/<pkg>/test/ for new public exports; new branches/error paths/edge cases (zero, MAX_UINT256, negative bigints); modified/removed exports without test updates; onchain code paths with at least one fork/mock test; snapshot/schema tests updated when generated outputs change.
   Each agent receives the full diff AND changed file contents, and returns findings as JSON: [{severity, file, line, description}]

8. Collect and deduplicate all agent findings (3-line tolerance). Keep highest severity for same file+line. Sort by file path ASC, line number ASC, severity DESC.

9. POST REVIEW to GitHub as a single atomic call:
   Build a JSON file at /tmp/pr-review-<PR_NUMBER>-comments.json with commit_id (=<HEAD_SHA>), event="COMMENT", body (summary table), and comments[] array (one entry per finding with path, line, side="RIGHT", body).
   Run: gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/reviews --method POST --input /tmp/pr-review-<PR_NUMBER>-comments.json
   Clean up: rm -f /tmp/pr-review-<PR_NUMBER>-comments.json

10. OPTIONAL CODEX: If `which codex` succeeds, run codex review in background.

11. Say "Review posted for PR #<PR_NUMBER> commit <HEAD_SHA_SHORT>: <N> findings (X critical, Y important, Z medium, W minor)."

CYCLE END — the cron scheduler will run this again in 2 minutes.
```

**After CronCreate returns the job ID:**

1. Report the job ID to the user
2. Tell them they can cancel with `CronDelete` using that ID
3. Note that the watcher auto-expires after 3 days
4. Only THEN is the skill complete

## Error Handling

- If the PR doesn't exist: tell the user and stop
- If the diff is too large for agents: split by file groups and review in batches
- If posting review fails (e.g., permissions): fall back to posting a single PR comment with all findings using `gh api repos/<owner>/<repo>/issues/<PR_NUMBER>/comments`
- If an agent fails: continue with results from other agents, note which aspect was skipped
- If CronCreate is not available: skip continuous monitoring, inform the user that `--watch` requires CronCreate

## Notes

- **Local-first**: Always use local filesystem and git commands for reading code, diffs, and file contents. Only use GitHub API for posting reviews/comments (write operations). Never use the GitHub API to read diffs or file contents — the local repo has everything.
- **Unified command**: This command replaces the old separate `/review` (CI-only) and `/pr-review` (local-only) commands. It auto-detects the environment and adapts its behavior.
- **CI mode differences**: In CI, the review submits a formal verdict (`APPROVE` or `REQUEST_CHANGES`), includes `CLAUDE_REVIEW_COMPLETE` markers, and does not support `--watch`. In local mode, the review always posts as `COMMENT` and optionally supports `--watch`.
- **Self-contained watcher**: The cron watcher performs the full review inline (launches agents, posts review) rather than re-invoking the skill. This avoids recursive watcher creation and ensures each cron tick is a complete review cycle.
- Always review the FULL PR diff, not just the latest commit — this ensures context and cross-file impact are considered
- Each re-review posts a new review (GitHub keeps the history)
- This skill works on any repository — it detects owner/repo from git remote automatically
- The skill assumes it is invoked from within the git repository

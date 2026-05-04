# pr-review

Reviews a GitHub Pull Request using parallel specialized agents, posts findings as inline review comments. Supports CI mode (GitHub Actions) and local mode. Optionally watches for new commits and re-reviews automatically.

## Usage

```
/pr-review <PR_NUMBER>                # review an open PR (CI or Local PR mode)
/pr-review <PR_NUMBER> --watch        # also start a 2-min watcher (Local PR mode only)
/pr-review --local                    # review local branch vs default base, output to terminal
/pr-review --local <BASE_BRANCH>      # review local branch vs explicit base
/pr-review --local --fix              # review locally and apply fixes (unstaged)
@claude /pr-review
```

## Valid argument combinations

Argument validation runs at the top of Step 1. Anything not in the table below is rejected.

| Invocation | Mode | Notes |
|---|---|---|
| `/pr-review <PR_NUMBER>` (no flags) | **CI** if `CI=true`/`GITHUB_ACTIONS=true`, else **Local PR** | |
| `/pr-review <PR_NUMBER> --watch` | **Local PR** with watcher | `--watch` rejected in CI mode |
| `/pr-review --local` | **Local-only** | base branch auto-detected |
| `/pr-review --local <BASE_BRANCH>` | **Local-only** | explicit base |
| `/pr-review --local --fix` | **Local-only**, applies fixes | unstaged changes preserved |
| `/pr-review --local <BASE_BRANCH> --fix` | **Local-only**, applies fixes | |

`<BASE_BRANCH>` is positional; flag order is otherwise free (`--local --fix` ≡ `--fix --local`). The base branch must NOT begin with `--`.

Conflicts:

- `--local` + `--watch` → warn `--watch is ignored in --local mode (nothing to watch)`, drop `--watch`.
- `--local` + `<PR_NUMBER>` → warn `<PR_NUMBER> ignored — --local is set`, drop `<PR_NUMBER>`.
- `--local` while `CI=true`/`GITHUB_ACTIONS=true` → `--local` always wins (explicit user intent over env detection).

### Environment variables

| Variable | Effect |
|---|---|
| `PR_REVIEW_FIX_BYPASS_STALE_STASH=1` | `--local --fix` only: bypass the pre-flight stale-stash safety check (Step 7 alt 2b Check 1). Use when a deliberately-named user stash with the exact subject `pr-review --local --fix safety stash` is present and the user has confirmed it isn't an orphan from a crashed run. Default: unset (= safety check enforced). |

## Examples

```
/pr-review 123
/pr-review 456 --watch
/pr-review --local
/pr-review --local develop
/pr-review --local --fix
@claude /pr-review this PR
```

### Validating `--local` end-to-end

The `--local` flow is stateless and emits a single grep-able sentinel per outcome. A maintainer changing this skill should verify each shape:

| Scenario | Expected last line |
|---|---|
| Clean branch, no findings | `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings present | `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings + agent crash | `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.` |
| `--fix` happy path | `Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).` plus `git diff` shows the unstaged edits. |
| `--fix` with stash-pop conflict | `Sentinel: FIX_DONE_WITH_STASH_CONFLICTS — <X> applied, stash@{0} unpopped due to conflicts in <files>.` |
| `--fix` aborted before any edit | `Sentinel: FIX_ABORTED — <reason>.` |

**Caveat (idempotency boundary):** the diff-derived inputs and sentinel structure are deterministic across runs, but Step 5 launches LLM-backed agents whose finding wording can drift even when the diff is byte-identical. Re-runs should produce the SAME sentinel and the SAME counts; finding *text* may vary.

## Documentation Reference

When reviewing, refer to these project docs as needed:

| Document               | Path                       | Use For                                                                       |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **Engineering Rules**  | `AGENTS.md` (root)         | Canonical engineering rules. `CLAUDE.md` is a symlink — read AGENTS.md.       |
| **Mission**            | `MISSION.md`               | Mission, scope, and values — *why* the rules in AGENTS.md exist               |
| **Per-package Rules**  | `packages/<pkg>/AGENTS.md` | Package-specific refinements of the root rules (and nested AGENTS.md too)     |
| **Architecture docs**  | `packages/<pkg>/ARCHITECTURE.md`, `packages/<pkg>/README.md` | Package design context (read for the packages touched by the diff) |
| **Contributing**       | `CONTRIBUTING.md`          | Dev setup, package layout, release/changesets flow                            |
| **Security policy**    | `SECURITY.md`              | Security policy (read when security-relevant code is touched)                 |
| **TIB Template**       | `docs/tibs/TEMPLATE.md`    | Format for design docs referenced from PRs                                    |
| **Biome config**       | `biome.json`               | Style/lint rules enforced on PRs (`pnpm lint`)                                |

> **TWO-PHASE SKILL**: Phase 1 (Steps 1-8, picking ONE of three Step 7 variants based on mode — CI / Local PR / Local-only) does the initial review. Phase 2 (Step 9) creates a continuous watcher via CronCreate, and runs only in Local PR mode with `--watch`. CI mode and Local-only mode never reach Phase 2. If `--watch` is used, the skill is NOT complete until Step 9's CronCreate call succeeds and you report the job ID to the user.

## Placeholder convention

Two classes of placeholders. Step 9 has a third — see "Placeholder discipline (CRITICAL)" inside Step 9 for the watcher's `<UPPERCASE>` (CronCreate-time) vs `${CYCLE_*}` (cycle-derived) distinction.

### Static (resolved once before any step that uses them)

| Placeholder | Source | Description |
|---|---|---|
| `<OWNER>` | parsed from git remote | GitHub repo owner |
| `<REPO>` | parsed from git remote | GitHub repo name |
| `<PR_NUMBER>` | user argument (omitted in `--local` mode) | Pull request number |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` (PR modes) OR `--local` arg / auto-detected (Local-only) | Base branch |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` (PR modes) OR `git branch --show-current` (Local-only) | Head/current branch |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid` (PR modes) OR `git rev-parse HEAD` (Local-only) | Head commit full SHA |
| `<HEAD_SHA_SHORT>` | first 7 chars of `<HEAD_SHA>` | Head commit short SHA |
| `<MERGE_BASE>` | `git merge-base origin/<BASE_BRANCH> origin/<HEAD_BRANCH>` (PR modes) OR `git merge-base origin/<BASE_BRANCH> HEAD` (Local-only). **Note**: in the watcher prompt this is re-derived per cycle as `${CYCLE_MERGE_BASE}` — do not bake the CronCreate-time value in. | Common ancestor commit |
| `<MERGE_BASE_SHORT>` | first 7 chars of `<MERGE_BASE>` | Merge-base short SHA |
| `<REPO_PATH>` | `git rev-parse --show-toplevel` | Absolute path to repo root |
| `<BOT_LOGIN>` | `gh api user --jq '.login'` (PR modes only) | Current GitHub user's login |

### Computed at runtime (do NOT include in any pre-flight static-placeholder check)

| Placeholder | Source | Description |
|---|---|---|
| `<PROJECT_CONTEXT>` | Step 4 reads | Bundle of project rules passed into each agent prompt |
| `<FAILED_AGENTS>` | Step 6 aggregator | Count of agents that returned `{"agent_error": "..."}` or unparseable JSON |
| `<REVIEW_BODY>` | Step 7 builders | The Markdown body of the posted review |
| `<SEVERITY>` | per-finding | `Critical` / `High` / `Medium` / `Low` |
| `<N>`, `<X>`, `<Y>`, `<Z>`, `<W>`, `<M>`, `<U>`, `<names>`, `<file>`, `<line>` | report templates | counts and per-row data inside output sentinels and tables |

## Step 1: Detect Mode and Repository

### 1a: Argument validation (resolve conflicts BEFORE anything else)

Apply these rules in order — emit each warning to the user before dropping the conflicting flag:

1. If `--local` is set AND `--watch` is set → warn `--watch is ignored in --local mode (nothing to watch)`. Drop `--watch`.
2. If `--local` is set AND a positional `<PR_NUMBER>` is set → warn `<PR_NUMBER> ignored — --local is set`. Drop `<PR_NUMBER>`.
3. If `--local` is set AND `CI=true` or `GITHUB_ACTIONS=true` → `--local` always wins (explicit user intent over env detection). Continue without warning.
4. If `--watch` is set AND `CI=true`/`GITHUB_ACTIONS=true` → reject with error `--watch is not supported in CI mode`. Stop.
5. If neither `--local` nor `<PR_NUMBER>` is set → reject with error `pass either <PR_NUMBER> or --local`. Stop.

### 1b: Mode dispatch

After 1a, exactly one of these modes applies. Every later step that depends on mode must check the table:

| Mode | Trigger | Posts to GitHub? | Verdict | `--watch`? | `--fix`? |
|---|---|---|---|---|---|
| **CI** | `CI=true`/`GITHUB_ACTIONS=true` AND `<PR_NUMBER>`, no `--local` | yes — atomic review | `APPROVE` / `REQUEST_CHANGES` | no | no |
| **Local PR** | locally + `<PR_NUMBER>`, no `--local` | yes — `COMMENT` event | n/a | optional | no |
| **Local-only** | `--local` | **no** | n/a | n/a | optional |

### 1c: Repository detection

Extract owner and repo from the git remote:

```bash
git remote get-url origin
```

Parse `<OWNER>` and `<REPO>` from the URL (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git` formats). Strip the `.git` suffix.

### 1d: Current user detection (PR modes only)

Determine the current GitHub user (needed for watcher SHA tracking) — skip in `--local` mode:

```bash
BOT_LOGIN=$(gh api user --jq '.login')
```

Store this as `<BOT_LOGIN>` for use in Step 9.

## Step 2: Resolve Branches and Head SHA

Mode dispatch (per Step 1b): if Local-only, follow ONLY the Local-only subsection below; skip the PR-modes subsection entirely. Otherwise follow ONLY the CI / Local PR subsection.

### CI mode / Local PR mode (a `<PR_NUMBER>` was provided AND `--local` is NOT set)

Use local `gh` CLI to get PR metadata:

```bash
PR_JSON=$(gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,headRefOid,state 2>&1)
if [ $? -ne 0 ]; then
  echo "gh pr view <PR_NUMBER> failed: $PR_JSON" >&2
  exit 1
fi
```

Extract from `$PR_JSON`:

- `<BASE_BRANCH>` — the base branch (`baseRefName`)
- `<HEAD_BRANCH>` — the head/PR branch (`headRefName`)
- `<HEAD_SHA>` — the head commit SHA (`headRefOid`)
- `state` — must be `OPEN`

Validate that all four are non-empty AND not whitespace-only before proceeding (an empty or whitespace-only `baseRefName` would silently corrupt every downstream `git`/`gh` command — e.g. `git fetch origin " "`). Use `[ -z "${X//[[:space:]]/}" ]` (not bare `[ -z "$X" ]`) so whitespace is rejected. Abort with `gh pr view returned malformed JSON` if any field fails the check.

Then fetch the latest remote state:

```bash
git fetch origin
```

If the PR is not open, inform the user and stop.

### Local-only mode (`--local` was passed)

Skip the GitHub API entirely. Derive the same placeholders from the local git state:

```bash
git fetch origin

HEAD_BRANCH=$(git branch --show-current)
if [ -z "$HEAD_BRANCH" ]; then
  # Detached HEAD — use the short SHA as a display-only branch name
  HEAD_BRANCH=$(git rev-parse --short HEAD)
fi
HEAD_SHA=$(git rev-parse HEAD)
```

Resolve `<BASE_BRANCH>`:

1. If a base-branch argument was provided to `--local`, use it.
2. Otherwise auto-detect the repo's default branch:
   ```bash
   BASE_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | sed 's/.*: //' | tr -d '[:space:]')
   if [ -z "$BASE_BRANCH" ]; then
     # Fall through to a verified fallback chain
     for candidate in main master; do
       if git show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
         BASE_BRANCH=$candidate
         break
       fi
     done
   fi
   if [ -z "$BASE_BRANCH" ]; then
     echo "Could not resolve base branch (no origin/main, no origin/master). Pass one explicitly: /pr-review --local <BASE_BRANCH>" >&2
     exit 1
   fi
   ```

Pre-condition before any equality check: both `<HEAD_BRANCH>` and `<BASE_BRANCH>` must be non-empty (the previous block guarantees this). Then:

- If `<HEAD_BRANCH>` equals `<BASE_BRANCH>` AND there are no uncommitted changes (`git status --porcelain` is empty), inform the user `No changes to review on <HEAD_BRANCH> vs <BASE_BRANCH>` and stop.
- If detached HEAD (i.e. `git branch --show-current` was empty), the equality check uses the short SHA — it will not match `<BASE_BRANCH>` unless the user is exactly on the base branch's tip commit.

## Step 3: Get Full Diff Locally

**IMPORTANT: Use the local repo on disk, NOT the GitHub API, for reading code and diffs.**

### CI mode / Local PR mode

```bash
# Get the merge base between PR head and base branch
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> origin/<HEAD_BRANCH>)

# Full diff of the PR
git diff $MERGE_BASE..origin/<HEAD_BRANCH>

# List of changed files
git diff --name-only $MERGE_BASE..origin/<HEAD_BRANCH>
```

### Local-only mode (`--local`)

Diff the current branch (including uncommitted work) against the base:

```bash
# Merge base of current HEAD with the base branch
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> HEAD)

# Committed diff
git diff $MERGE_BASE..HEAD
git diff --name-only $MERGE_BASE..HEAD

# Uncommitted diff (staged + unstaged)
git diff HEAD
git diff --name-only HEAD
```

Combine the two file lists, deduplicate, and announce the count of uncommitted files included so the user knows the review covers their full work-in-progress:

> "Including X uncommitted file(s) in the review."

If both diffs are empty, stop with the message from Step 2.

### Both modes

Also read the actual changed files from the local filesystem using the Read tool so agents have full file context (not just diff hunks). Reading from disk naturally reflects the latest state including any uncommitted changes.

## Step 4: Read Project Context (Adaptive)

Before launching review agents, read the project-level documentation that defines the rules and intent of this repo. Store what you find as `<PROJECT_CONTEXT>` and pass it to each agent in Step 5.

### Always read (root-level baseline)

1. `AGENTS.md` (root) — engineering rules. **This is the canonical file**; `CLAUDE.md` is a symlink to it (do not also read CLAUDE.md, it is identical).
2. `MISSION.md` — mission, scope, and values. Explains *why* the rules in AGENTS.md exist.
3. `CONTRIBUTING.md` — dev setup, package layout, release/changesets flow.
4. `biome.json` — style/lint rules enforced on PRs (`pnpm lint`).

### Conditional baseline (read when relevant)

5. `docs/jsdoc-style.md` — **canonical JSDoc style guide** for the monorepo. Operationalizes AGENTS.md §6. Read whenever the diff touches an exported symbol from any `packages/<pkg>/src/index.ts` re-export entry, an `@example` block, or any JSDoc comment. Backed by `docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md` (rollout sequence).
6. `SECURITY.md` — security policy. Read if any security-relevant code is touched (auth, signing, RPC URLs, calldata, addresses).
7. `docs/tibs/TEMPLATE.md` — read if a doc/TIB-style file is touched in the diff.

### Per-package context (only for packages touched by the diff)

For each unique package directory among the changed files (e.g. a file at `packages/morpho-sdk/src/actions/foo.ts` belongs to package `packages/morpho-sdk`), read in this order:

1. `packages/<pkg>/AGENTS.md` — package-specific refinements of the root rules. **Per-package AGENTS.md may add detail but must not contradict the root** (per the root AGENTS.md rule).
2. `packages/<pkg>/README.md` — public-facing description and usage examples.
3. `packages/<pkg>/ARCHITECTURE.md` — if present (e.g. `packages/morpho-sdk/ARCHITECTURE.md`).
4. Any other top-level `*.md` in the package (e.g. `packages/morpho-sdk/BUNDLER3.md`) — if present.

Then for any nested `AGENTS.md` files along the path of touched files (at any depth — e.g. `packages/morpho-sdk/src/actions/AGENTS.md`, `packages/morpho-sdk/src/actions/marketV1/AGENTS.md`), read each one. Nested `AGENTS.md` further refines rules for that subtree.

**Discovery — apply this exact procedure**:

1. Use the **Glob tool** (preferred over raw `find`): `**/AGENTS.md` and `packages/*/*.md`. The Glob tool already excludes `.git`, `node_modules`, and the project's gitignored output directories — no manual exclude list required.
2. Filter the AGENTS.md results to only those whose path is a prefix of (or equal to) the directory of at least one changed file. The root `AGENTS.md` is always included as part of the always-read baseline above.
3. Filter the package `*.md` results similarly (only for packages touched by the diff).

If you must use a shell for some reason, here are explicit excludes — note `lib/`, `dist/`, `build/`, `.next/`, `coverage/`, `.turbo/`, `.context/` may all contain stray markdown that is NOT authoritative project rules:

```bash
find . -name AGENTS.md \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -not -path "./lib/*" \
  -not -path "./dist/*" \
  -not -path "./build/*" \
  -not -path "./coverage/*" \
  -not -path "./.next/*" \
  -not -path "./.turbo/*" \
  -not -path "./.context/*"
```

Do NOT use `-maxdepth 2` — it would miss nested `AGENTS.md` (e.g. `packages/morpho-sdk/src/actions/marketV1/AGENTS.md` is at depth 6).

### Files outside `packages/`

If a changed file lives outside `packages/` (root files like `AGENTS.md` itself, or `.agents/commands/*.md`, `.github/workflows/*`, `scripts/*`, `docs/*`, etc.), it has no per-package context — use only the root-level baseline (items 1–4 always; items 5–7 when their conditional triggers apply). Do NOT attempt to derive a synthetic package directory from the path.

### Worked example

If the diff touches `packages/morpho-sdk/src/actions/foo.ts` and `packages/blue-sdk-viem/src/bar.ts`:

- Always read (items 1–4): `AGENTS.md`, `MISSION.md`, `CONTRIBUTING.md`, `biome.json`. Conditionally read (items 5–7): `docs/jsdoc-style.md` if either file modifies an exported symbol's signature, JSDoc, or `@example` block; `SECURITY.md` if security-relevant code is touched; `docs/tibs/TEMPLATE.md` if a TIB-style doc is touched.
- For `packages/morpho-sdk`: `packages/morpho-sdk/AGENTS.md`, `packages/morpho-sdk/README.md`, `packages/morpho-sdk/ARCHITECTURE.md`, `packages/morpho-sdk/BUNDLER3.md`, `packages/morpho-sdk/src/actions/AGENTS.md` (nested, on the path).
- For `packages/blue-sdk-viem`: `packages/blue-sdk-viem/AGENTS.md`, `packages/blue-sdk-viem/README.md`.

If the diff also touches `.agents/commands/pr-review.md` (outside `packages/`), no extra per-package files — just the root baseline.

### Echo files read

After the discovery completes, **print** the list to the user so they can spot omissions:

```
Context files read (N):
  AGENTS.md (root)
  MISSION.md
  packages/morpho-sdk/AGENTS.md
  packages/morpho-sdk/src/actions/AGENTS.md
  ...
```

## Step 5: Launch Parallel Review Agents

Launch ALL 7 review agents **in parallel** using the Agent tool (subagent_type: `"general-purpose"`). Shared per-agent contract — repeated below in each per-agent block only where it diverges:

- Each agent receives: the full diff, the full content of changed files (read from local FS), `<PROJECT_CONTEXT>` from Step 4, the repo path / owner / repo / PR-number-or-branch-info / base+head branches.
- Per-package `AGENTS.md` rules refine the root for the specific package; the root wins on contradictions.
- Agents must analyze the **full diff**, not just the latest commit.
- Each agent **must return** a JSON array `[{severity: "critical"|"high"|"medium"|"low", file: "path", line: number, description: "what is wrong + how to fix"}]` OR an explicit error sentinel `{"agent_error": "<reason>"}` if it could not complete (the aggregator in Step 6 distinguishes "no findings" from "agent failed").
- Only **actionable** findings — no praise, no summaries.

### Agent 1: Code Quality

Focus: TypeScript strict mode, type safety, early returns, `as` assertions, duplication, naming conventions, code smells, magic numbers, overly complex functions.

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

### Agent 6: Documentation Analyzer

Focus: JSDoc/TSDoc on public APIs and types in `packages/<pkg>/src/index.ts` and the
files it re-exports.

**Canonical JSDoc rules: `docs/jsdoc-style.md`** (operationalizes AGENTS.md §6 and MISSION.md goal #3 — AI-legibility). Backed by `docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md` (rollout sequence). The agent prompt MUST include the contents of `docs/jsdoc-style.md` (or a faithful summary) so reviewers flag deviations from the canonical shape, not just generic JSDoc smells.

Prompt must include:

- The `docs/jsdoc-style.md` checklist (what needs JSDoc, what does not, the required block order, `@param` / `@returns` / `@throws` / `@example` rules, error-message phrasing).
- New or modified public exports (types, functions, classes) re-exported from `packages/<pkg>/src/index.ts` must have JSDoc that conforms to `docs/jsdoc-style.md`.
- Doc comments are accurate vs. the implementation (no stale references to renamed args,
  removed return values, changed throw behavior).
- Public types use semantic names — flag generic `T`, `U`, `Foo` where domain names exist
  (e.g. `Address`, `MarketId`).
- README / package-level doc files are updated when the public API changes shape.
- Examples in doc comments compile (no obvious type errors in inline `@example` blocks); they should be runnable single-file recipes per `docs/jsdoc-style.md` and AGENTS.md §6.

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

1. **First, count agent failures.** An agent counts as failed if any of these hold:
   - Returned `{"agent_error": "..."}` (the explicit sentinel from Step 5).
   - Returned text that is not parseable as JSON.
   - Returned a JSON value that is not an array (e.g. an object that is not the error sentinel).
   - Returned an array containing one or more objects missing required fields (`severity` not in `critical`/`high`/`medium`/`low`, missing or non-string `file`, missing or non-numeric `line`, missing or empty `description`) — count the agent as **partially failed**: keep the valid findings from that agent, but include the agent in `<FAILED_AGENTS>` so the report flags it.

   Track `<FAILED_AGENTS>` as a count plus the names. This count flows into Step 7's reporting so a "no findings" verdict is never reported when some agents crashed or returned partial garbage.

2. **Deduplicate** with this rule (do NOT collapse genuinely distinct findings):
   - Findings on the SAME file at the EXACT same line are duplicates ONLY when their descriptions overlap meaningfully (≥50% token overlap, or one is a clear paraphrase of the other). Keep the one with the higher severity; if descriptions don't overlap, keep BOTH (e.g. one agent flags missing JSDoc on line 42, another flags swallowed catch on line 42 — both stay).
   - Findings within ±3 lines but on the same file are merged ONLY when severities AND descriptions overlap (catches cases where two agents pointed at adjacent lines of the same construct).
   - When merging, keep the higher-severity finding's text.

3. Sort by: file path (alphabetical, ASC), then line number (ASC), then severity (DESC).

Severity labels (used everywhere — comments, summary tables, verdict logic):

- `critical` → Critical
- `high` → High
- `medium` → Medium
- `low` → Low

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

| Verdict             | When                                  | Event             |
| ------------------- | ------------------------------------- | ----------------- |
| **Approve**         | No critical or high issues            | `APPROVE`         |
| **Request Changes** | Any critical, or multiple high issues | `REQUEST_CHANGES` |

The `body` field for CI mode must include the CI markers and the guidelines checklist:

```
<!-- CLAUDE_REVIEW_COMPLETE -->
<!-- CLAUDE_VERDICT:APPROVE -->  <!-- Only include for approvals -->
## Code Review Summary

### Overview
<Brief summary of the PR and overall assessment>

### Findings
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues

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
**Approved** - Code looks good!
<!-- OR -->
**Changes Requested** - Please address the issues above.
```

If `<FAILED_AGENTS>` from Step 6 is non-zero, append a warning line to the body BEFORE the verdict:

```
> WARNING: <FAILED_AGENTS> of 7 agents failed (<names>) — review may be incomplete.
```

When agents have failed, downgrade the verdict: never `APPROVE` while any agent failed; default to `COMMENT` (skip the formal verdict) if the failure count is high enough that a critical issue could have been missed.

Submit the review and all inline comments in a **single atomic call**:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews \
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
- If the review creation fails (e.g., permissions, line numbers out of range), fall back to a single PR comment via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`

**After posting, proceed to Step 8.** CI mode does not use `--watch`.

---

## Step 7 (alt): Post Review (Local PR Mode)

**Only follow this step if running locally with a `<PR_NUMBER>` (NOT in CI, NOT in `--local` mode).**

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
| Critical | X |
| High | X |
| Medium | X |
| Low | X |

_This is an automated parallel review. It will re-run when new commits are pushed (if watching)._
```

If `<FAILED_AGENTS>` from Step 6 is non-zero, prepend `> WARNING: <FAILED_AGENTS> of 7 agents failed (<names>) — review may be incomplete.` to the body.

Submit the review and all inline comments in a **single atomic call**:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  --input "$REVIEW_FILE"
```

Clean up: `rm -f "$REVIEW_FILE"`

**Important**: If the atomic review API call fails (e.g., permissions, line numbers out of range), fall back to posting a single PR-level comment with all findings via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`.

If there are zero findings AND `<FAILED_AGENTS>` is zero, submit with an empty `comments` array and a body saying `Sentinel: REVIEW_CLEAN — no issues found in this review.`. If there are zero findings but `<FAILED_AGENTS>` is non-zero, the body must instead say `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of 7 agents failed; no findings does NOT mean clean.`

### 7b: Optional Codex pass

Check if `codex` CLI is available:

```bash
which codex
```

If available, run in the background (do not wait for it to finish). Validate branch names BEFORE substitution — `<HEAD_BRANCH>` and `<BASE_BRANCH>` could legally contain `$`, backticks, or quotes. Reject any branch name that doesn't match `^[A-Za-z0-9._/-]+$` and skip the Codex pass with a warning instead of running the substitution:

```bash
if printf '%s' "<HEAD_BRANCH>" | grep -qE '^[A-Za-z0-9._/-]+$' \
   && printf '%s' "<BASE_BRANCH>" | grep -qE '^[A-Za-z0-9._/-]+$'; then
  codex exec -c model_reasoning_effort=xhigh "$(cat <<'CODEX_EOF'
Review PR #<PR_NUMBER> in this repo. The PR branch is <HEAD_BRANCH> based on <BASE_BRANCH>. Run 'git diff origin/<BASE_BRANCH>...origin/<HEAD_BRANCH>' to get the full diff. Analyze the changes for bugs, security issues, code quality, and best practices. Post your findings as inline review comments on the PR using 'gh api' to create a pull request review with comments on specific lines.
CODEX_EOF
)" 2>&1 | tail -50
else
  echo "Skipping Codex pass: branch names contain unsafe characters." >&2
fi
```

If `codex` is not installed or the command fails, log the error and continue — Claude review is sufficient on its own.

---

## Step 7 (alt 2): Print Findings to Terminal (Local-only Mode)

**Only follow this step if `--local` was passed.** Make NO calls to the GitHub API — output is terminal-only.

Format the deduplicated findings (from Step 6) directly in the conversation:

```
## Local-only Code Review

**Branch:** <HEAD_BRANCH> -> <BASE_BRANCH>  |  **Files:** <count>  |  **Range:** <MERGE_BASE_SHORT>..<HEAD_SHA_SHORT>
**Uncommitted files included:** <U>  |  **Mode:** Local-only

| Severity | Count |
|----------|-------|
| Critical | X     |
| High     | X     |
| Medium   | X     |
| Low      | X     |

### <file_path>

- **[CRITICAL]** L<line>: <description>
  _Suggestion: <how to fix>_

- **[HIGH]** L<line>: <description>
  _Suggestion: <how to fix>_

### <next_file_path>
...
```

Group findings by file (already sorted by Step 6). Within each file, list highest-severity findings first.

**Sentinel lines (single line, grep-able). Names are namespaced per mode** so a downstream parser can match on the trailer-prefix alone:

- Zero findings AND `<FAILED_AGENTS>` is zero → end with `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.`
- Zero findings BUT `<FAILED_AGENTS>` is non-zero → end with `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.`
- Non-zero findings → end with `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` and append the same agent-failure warning if applicable.

**Suppress the REVIEW_DONE_LOCAL sentinel when `--fix` is set** — Step 7 (alt 2b) emits its own `Sentinel: FIX_DONE_LOCAL` (and friends) at the end of the run. With `--fix`, the user sees one combined run with one terminal sentinel; without `--fix`, the user sees the review sentinel above. (REVIEW_CLEAN/REVIEW_INCOMPLETE still print before falling through to 2b — these are honest summaries even when fixes are about to be applied.)

**Skip the optional Codex pass in `--local` mode** — Codex would attempt to post to a PR that may not exist.

**Idempotency:** Local-only mode is stateless — re-running produces fresh output with no persisted artifacts. Safe to run repeatedly. (Compare with `--watch`, which sets persistent state via CronCreate.) Determinism boundary: the diff-derived inputs and sentinel structure are deterministic across runs, but Step 5 launches LLM-backed agents whose finding *wording* can drift even when the diff is byte-identical. Re-runs should produce the SAME sentinel and the SAME counts; finding text may vary.

**Drift reminder for `--local --fix`:** the `--fix` sub-step (7 alt 2b) reimplements the apply-and-validate mechanics from `/pr-fix` Step 6c–6d (read-then-Edit, biome check, hard "no commit/push" constraint). Any future change to `/pr-fix` Step 6c–6d must be evaluated for propagation here, and vice versa. Track with a `# DRIFT-CHECK: keep in sync with /pr-fix Step 6c-6d` comment in any PR that touches either.

If `--fix` was passed, proceed to **Step 7 (alt 2b)**. Otherwise the skill is complete here — Steps 8 and 9 do not apply in `--local` mode.

### 7 (alt 2b): Apply Fixes Locally (only with --fix)

**Only execute this sub-step if `--local --fix` was passed.**

#### Pre-flight: stale-stash check + stash uncommitted changes (Stash discipline)

The Edit tool has no undo. If a fix breaks linting we must revert WITHOUT clobbering pre-existing uncommitted user work. The discipline runs in two pre-flight checks before the fix loop:

**Check 1 — refuse to start on a stale safety stash.** A prior `--local --fix` run that crashed could leave a `pr-review --local --fix safety stash` entry in `git stash list`. Detect that and abort loud — the user must inspect it before we create another stash with the same message.

The check anchors on the WHOLE stash subject (after stripping `git stash list`'s `On <branch>:` prefix) using fixed-string matching, so a user-named stash that merely *contains* the substring won't false-positive. We capture the count and the matching refs so the user knows exactly how many stashes the check fires on, and we gate the warning prose on the bypass env var so an opted-in user doesn't see the "stale stash" warning before the bypass confirmation:

```bash
MATCHING_STASH_REFS=$(git stash list --format='%gd %gs' \
  | awk -F' ' 'NR>0 { ref=$1; $1=""; sub(/^ /,""); if ($0=="pr-review --local --fix safety stash") print ref }')
MATCHING_STASH_COUNT=$(printf '%s' "$MATCHING_STASH_REFS" | grep -c '^stash@' || true)
if [ "$MATCHING_STASH_COUNT" -gt 0 ]; then
  if [ "${PR_REVIEW_FIX_BYPASS_STALE_STASH:-0}" = "1" ]; then
    echo "PR_REVIEW_FIX_BYPASS_STALE_STASH=1 — ${MATCHING_STASH_COUNT} 'pr-review --local --fix safety stash' entry/entries present; bypassing stale-stash check at user request."
  else
    echo "Sentinel: FIX_ABORTED — ${MATCHING_STASH_COUNT} stale 'pr-review --local --fix safety stash' entry/entries detected:"
    printf '  %s\n' $MATCHING_STASH_REFS
    echo "Inspect each with: git stash show --include-untracked -p <ref>"
    echo "Resolve each (pop, drop, or restore manually) before re-running this skill."
    echo ""
    echo "Escape hatch for false-positives: if you have a deliberately-named stash with this exact subject"
    echo "that you want to keep, drop the safety check by setting PR_REVIEW_FIX_BYPASS_STALE_STASH=1 in"
    echo "the environment. Use sparingly — the check exists to prevent stash-pop ambiguity."
    exit 1
  fi
fi
```

**Check 2 — stash any pre-existing uncommitted work.** If the user has uncommitted changes when starting the run, stash them so a failed-lint revert can re-Edit cleanly:

```bash
STASHED=0
if [ -n "$(git status --porcelain)" ]; then
  echo "Pre-existing uncommitted file(s) detected. Stashing them so failed fixes can be safely reverted."
  echo "(Stashed under: 'pr-review --local --fix safety stash'.)"
  if ! git stash push -u -m "pr-review --local --fix safety stash" >/dev/null 2>&1; then
    echo "Sentinel: FIX_ABORTED — git stash push failed; refusing to apply fixes that cannot be safely reverted."
    exit 1
  fi
  STASHED=1
fi
```

If `git stash push` itself fails, the script aborts with the explicit `Sentinel: FIX_ABORTED` line above (so the failure is grep-able), and no edits are attempted.

**Observable post-condition (verify after a successful run):**

```
git stash list | grep 'pr-review --local --fix safety stash'
```

After a clean `--local --fix` run with no pre-existing uncommitted changes, this MUST return nothing (the script never created a stash). After a clean run that DID start with uncommitted changes, this should also return nothing (the stash was popped). If a `pr-review --local --fix safety stash` entry persists, either the script crashed mid-run or `git stash pop` produced conflicts — see the conflict path below.

#### Apply fixes

For each finding, starting from highest severity:

1. Read the file from the local filesystem.
2. Capture the original snippet (full file content) into memory before editing — this is the in-memory revert source if the fix breaks linting.
3. Apply the suggested fix using the Edit tool.
4. Validate with the project linter:
   ```bash
   pnpm exec biome check <file>
   ```
5. If the fix breaks linting, re-Edit the file back to the captured original snippet (the in-memory revert) and skip the finding. Do NOT use `git checkout -- <file>` — it would lose the freshly-applied prior fixes in the same file.
6. Track which findings were fixed and which were skipped.

#### Restore the pre-existing uncommitted work

```bash
STASH_CONFLICT_FILES=""
if [ "$STASHED" = "1" ]; then
  if ! git stash pop >/dev/null 2>&1; then
    # Capture the conflicting files for the sentinel below; do NOT skip the Fix Summary,
    # but switch to the WITH_STASH_CONFLICTS sentinel so the user can't mistake the
    # conflict-marker state for "clean unstaged fixes".
    STASH_CONFLICT_FILES=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
    echo "WARNING: stash pop produced conflicts in: $STASH_CONFLICT_FILES" >&2
    echo "         Your original uncommitted work is preserved in stash@{0}." >&2
    echo "         Resolve the conflict markers manually before re-running this skill." >&2
  fi
fi
```

If `STASH_CONFLICT_FILES` is non-empty, the Fix Summary below MUST emit `Sentinel: FIX_DONE_WITH_STASH_CONFLICTS — <X> applied, stash@{0} unpopped due to conflicts in <files>; resolve manually before running again` instead of the happy-path `Sentinel: FIX_DONE_LOCAL`. Setting the right sentinel is REQUIRED — `git diff` after a stash-pop conflict shows conflict markers interleaved with applied fixes, and the user must not be told "Changes are unstaged. Review with: git diff" without the conflict caveat.

#### Report

Local-only Fix Summary — distinct from `/pr-fix` Step 11 (that summary covers PR/commit/CI fields that don't apply here). The two are intentionally NOT byte-identical, but both end with a single grep-able `Sentinel: FIX_DONE_*` line so callers can match either:

```
## Fix Summary (Local-only)

Mode: Local-only (no PR, no commit, no push)
Fixed: X findings
Skipped: Y findings (see notes above)

Changes are unstaged. Review with: git diff
```

End with a sentinel line per outcome:

- Happy path → `Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).`
- Stash-pop conflict (see `Stash discipline` above) → `Sentinel: FIX_DONE_WITH_STASH_CONFLICTS — <X> applied, stash@{0} unpopped due to conflicts in <files>; resolve manually before running again.`
- Aborted before any edit (stash-push failed, or pre-flight error) → `Sentinel: FIX_ABORTED — <reason>.`

**Hard constraints — do NOT do any of the following in `--local --fix` mode:**

- Do NOT stage changes (`git add`).
- Do NOT commit.
- Do NOT push.
- Leave all changes as unstaged modifications so the user can review them with `git diff`.

The skill is complete after the Fix Summary — Steps 8 and 9 do not apply.

---

## Step 8: Report to User (CI / Local PR modes)

**Skip this step in `--local` mode** — the report was already printed in Step 7 (alt 2).

Print a summary that ends with a single grep-able sentinel line:

```
PR #<PR_NUMBER> review posted:
  Claude: <N> findings (X critical, Y high, Z medium, W low)
  Agent failures: <FAILED_AGENTS> of 7 (<names>) — review may be incomplete
  Codex:  <triggered in background / not available>
  Mode:   <CI / Local PR>
Last reviewed commit: <HEAD_SHA_SHORT>

Sentinel: REVIEW_DONE_PR — PR #<PR_NUMBER>, <N> findings, mode=<CI|LocalPR>, commit=<HEAD_SHA_SHORT>
```

(Drop the `Agent failures:` line when `<FAILED_AGENTS>` is zero. The sentinel is always present so callers can grep for it.)

If `--watch` was NOT passed (or in CI mode), the skill is complete here.

If `--watch` WAS passed AND in Local PR mode, **you MUST proceed to Step 9**.

## Step 9: Schedule Continuous Watch (only with --watch, Local PR mode only)

**Skip this step in `--local` mode** — there is no PR to watch.

**If `--watch` was passed, you MUST call `CronCreate` now.** Do not skip this step.

### Placeholder discipline (CRITICAL)

The watcher prompt embeds three kinds of placeholders. Substituting them incorrectly leads to either stale data or silent failure:

- **CronCreate-time placeholders (must substitute BEFORE CronCreate)** — exactly this allowlist: `<PR_NUMBER>`, `<OWNER>`, `<REPO>`, `<REPO_PATH>`, `<HEAD_BRANCH>`, `<BASE_BRANCH>`, `<BOT_LOGIN>`. These seven are static for the life of the watcher.
- **Cycle-derived (do NOT substitute)** — every cycle-local variable uses the `CYCLE_*` prefix for parity with `/pr-fix`'s watcher: `${CYCLE_HEAD_SHA}`, `${CYCLE_HEAD_SHA_SHORT}`, `${CYCLE_PR_STATE}`, `${CYCLE_LAST_REVIEWED_SHA}`, `${CYCLE_MERGE_BASE}`, `${CYCLE_FAILED_AGENTS}`, `${CYCLE_LAST_REVIEWED_RAW}`. Computed by the watcher agent each cycle. The literal `${...}` form must appear in the CronCreate prompt — the watcher agent expands them inside each cycle.
- **Report templates (do NOT substitute, NOT placeholders)** — count tokens like `<N>`, `<X>`, `<Y>`, `<Z>`, `<W>`, `<Q>`, `<D>`, `<P>`, `<A>`, `<S>`, `<R>` and structural tokens like `<file>`, `<line>`, `<reason>`, `<step>`, `<command>`, `<stderr>`, `<commentId>`, `<threadId>`, `<reply text per category above — replace ${CYCLE_HEAD_SHA} with the captured value>` are LITERALS inside output sentinels and inline templates that the watcher agent fills in at run time. They are NOT CronCreate-time placeholders.

**Pre-flight check before calling CronCreate** — scan the assembled prompt for any remaining `<[A-Z_]+>` substring AND check it against the CronCreate-time allowlist above. ONLY abort if a remaining match is in the allowlist (i.e. should have been substituted). Do NOT abort on report-template tokens (`<N>`, `<X>`, etc.) or on structural tokens. The empty-prompt case must also abort loud — an unset `$ASSEMBLED_PROMPT` would silently pass the grep check (no match → exit 1 → grep returns 1, which is FALSE under `if`):

```
if [ -z "${ASSEMBLED_PROMPT//[[:space:]]/}" ]; then
  echo "Sentinel: WATCH_REJECTED — assembled prompt is empty, unset, or whitespace-only; refusing to schedule a no-op watcher." >&2
  exit 1
fi
ALLOWLIST_REGEX='<(PR_NUMBER|OWNER|REPO|REPO_PATH|HEAD_BRANCH|BASE_BRANCH|BOT_LOGIN)>'
if printf '%s' "$ASSEMBLED_PROMPT" | grep -Eq "$ALLOWLIST_REGEX"; then
  echo "Sentinel: WATCH_REJECTED — CronCreate-time placeholder still present in prompt; re-render before scheduling." >&2
  exit 1
fi
```

`${...}` placeholders and report-template tokens like `<N>` / `<file>` are intentional and exempt by construction (the regex only matches the seven static placeholders by name).

### Failure handling discipline

Every `Run:` line in the cycle must have an exit-status check. On any failure, end the cycle with `Sentinel: WATCH_TRANSIENT_ERROR — <step>: <stderr>` and stop — do NOT proceed with stale or empty values. The cron scheduler will retry on the next tick.

### Drift reminder

The 7-agent set below mirrors Step 5 by hand. Any future Step 5 change — agent added/removed/renamed, prompt extended — must be propagated here in the same PR, or the watcher silently lags. Add a `# DRIFT-CHECK: keep in sync with Step 5` comment in every PR that touches Step 5.

### CronCreate parameters

- cron: `*/2 * * * *`
- recurring: true
- prompt: The prompt below, with `<UPPERCASE>` placeholders substituted at CronCreate time and `${CYCLE_*}` placeholders left intact:

```text
You are the PR review watcher for PR #<PR_NUMBER> in <OWNER>/<REPO>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>
Bot login: <BOT_LOGIN>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

Every shell command below must be checked for non-zero exit. On ANY non-zero exit, say "Sentinel: WATCH_TRANSIENT_ERROR — step <N> (<command>): <stderr>" and end this cycle. Do NOT proceed with stale or empty values.

Note on shell syntax in this prompt: the watcher agent reads each numbered step as INSTRUCTIONS, not as a verbatim bash script. When you see `set CYCLE_HEAD_SHA = ...` it means "compute the value via the shown command, store it as the cycle-local variable named `CYCLE_HEAD_SHA`, refer to it later as `${CYCLE_HEAD_SHA}`". When the watcher does run shell, the assignment is `CYCLE_HEAD_SHA=$(...)` (bare LHS — bash assignment never uses `${VAR}=...` on the LHS). EVERY cycle-local variable in this prompt uses the `CYCLE_` prefix.

CYCLE START:

1. FETCH AND CHECK STATE:
   Run: cd <REPO_PATH> && git fetch origin — abort cycle (transient error) on non-zero exit.
   set CYCLE_HEAD_SHA = `git rev-parse origin/<HEAD_BRANCH>` — abort cycle if empty.
   set CYCLE_PR_STATE = `gh pr view <PR_NUMBER> --repo <OWNER>/<REPO> --json state --jq '.state'` — abort cycle if gh fails or returns whitespace-only.
   If ${CYCLE_PR_STATE} is not "OPEN": say "Sentinel: WATCH_PR_CLOSED — PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting." and end.
   set CYCLE_HEAD_SHA_SHORT = first 7 chars of ${CYCLE_HEAD_SHA}.

2. GET LAST REVIEWED SHA:
   Query the most recent review posted by the bot on this PR (derived at cycle start from GitHub, NOT baked in at CronCreate time). Use jq's --arg to bind <BOT_LOGIN> safely so login content is never spliced into shell-quoted code. Note: `gh api --jq` accepts only one filter string, so the binding must be done by piping into a separate `jq` call (NOT by passing `--arg` to `gh api`):

   set CYCLE_LAST_REVIEWED_RAW = `gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews?per_page=100`
   if gh exit code != 0: abort cycle with WATCH_TRANSIENT_ERROR (auth / rate-limit / network — do NOT fall through to "review everything", which would post duplicate full reviews on every transient failure)
   set CYCLE_LAST_REVIEWED_SHA = `printf '%s' "${CYCLE_LAST_REVIEWED_RAW}" | jq --arg login "<BOT_LOGIN>" -r '[.[] | select(.user.login == $login or (.body | test("Parallel PR Review|Code Review Summary")))] | sort_by(.submitted_at) | last | .commit_id // ""'`

   - If gh exit was zero AND ${CYCLE_LAST_REVIEWED_SHA} is empty (no previous review), proceed with empty value (review everything on first sighting).
   - Otherwise ${CYCLE_LAST_REVIEWED_SHA} is the returned commit_id.

3. COMPARE SHA:
   If ${CYCLE_HEAD_SHA} == ${CYCLE_LAST_REVIEWED_SHA}: say "Sentinel: WATCH_REVIEW_CLEAN — PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review." and end this cycle.

4. NEW COMMIT DETECTED:
   Say "New commit detected on PR #<PR_NUMBER>: ${CYCLE_HEAD_SHA}. Running full review..."

5. GET FULL PR DIFF:
   cd <REPO_PATH>
   set CYCLE_MERGE_BASE = `git merge-base origin/<BASE_BRANCH> origin/<HEAD_BRANCH>` — abort cycle if empty.
   Run: git diff ${CYCLE_MERGE_BASE}..origin/<HEAD_BRANCH>
   Run: git diff --name-only ${CYCLE_MERGE_BASE}..origin/<HEAD_BRANCH>
   Also read each changed file from the local filesystem using the Read tool for full context.

6. READ PROJECT CONTEXT (Adaptive — re-discover per cycle, do NOT cache from earlier cycles). Mirrors Step 4 of the main flow:
   Always read (root, items 1–4): AGENTS.md (canonical; CLAUDE.md is a symlink — do not also read it), MISSION.md, CONTRIBUTING.md, biome.json.
   Conditional baseline (items 5–7, read when relevant to THIS cycle's diff):
     5. docs/jsdoc-style.md — when an exported symbol, JSDoc comment, or @example block is touched.
     6. SECURITY.md — when security-relevant code is touched (auth, signing, RPC URLs, calldata, addresses).
     7. docs/tibs/TEMPLATE.md — when a TIB-style doc is touched.
   Per-package (only for packages touched by THIS cycle's diff): packages/<pkg>/AGENTS.md, packages/<pkg>/README.md, packages/<pkg>/ARCHITECTURE.md and any other top-level *.md in the package (e.g. BUNDLER3.md), plus any nested AGENTS.md along the path of touched files (e.g. packages/morpho-sdk/src/actions/AGENTS.md).
   Files outside packages/ in the diff use only the root-level baseline (items 1–4 always; items 5–7 when their conditional triggers apply).
   Store as PROJECT_CONTEXT for agent prompts. Per-package AGENTS.md refines the root for that package; the root wins on contradictions.

7. LAUNCH REVIEW AGENTS in parallel using the Agent tool (subagent_type: "general-purpose"). Same 7-agent SDK set as Step 5 of the main flow — keep this list in sync (any Step 5 edit must propagate here in the same PR). Each agent receives the full diff, changed file contents, and PROJECT_CONTEXT. Returns findings as JSON: [{severity, file, line, description}] OR an explicit error sentinel {"agent_error": "<reason>"}.
   a. code-quality — TypeScript strict mode, type safety, early returns, assertions, duplication, naming, code smells. ALWAYS include cross-file impact (changed exports from packages/<pkg>/src/index.ts, public API signature changes, renamed/removed exports, new deep imports) and security (hardcoded secrets/RPC URLs, injection risks, auth bypass, eval/Function/dynamic import). Uses PROJECT_CONTEXT when present.
   b. module-architecture — package boundaries, public exports from src/index.ts, type-only imports, .js suffix (NodeNext), reuse of SDK types (Address, MarketId, ChainId, BigIntish), bigint for onchain quantities, as const / satisfies for ABIs. Uses PROJECT_CONTEXT when present.
   c. web3-security — contract interactions, tx params, wallets, permits, race conditions (CRITICAL). Uses PROJECT_CONTEXT when present.
   d. silent-failure-hunter — swallowed errors, empty catch blocks, missing error boundaries, unhandled rejections. Uses PROJECT_CONTEXT when present.
   e. style-conventions — Biome clean (pnpm lint), import ordering, type-only imports, no edits to lib/ output, edits to generated *inputs* (graphql/*.gql), not generated files. Uses PROJECT_CONTEXT when present.
   f. documentation — JSDoc/TSDoc on public APIs in packages/<pkg>/src/index.ts and re-exported files. Canonical rules: docs/jsdoc-style.md (operationalizes AGENTS.md §6 + MISSION.md goal #3). Check @param/@returns/@throws coverage per the style guide; doc accuracy vs. implementation; semantic type names; README updates when public API changes; @example blocks compile and follow the runnable-recipe shape from the style guide. Uses PROJECT_CONTEXT when present (which now includes docs/jsdoc-style.md when an exported symbol is touched).
   g. test-coverage — missing tests in packages/<pkg>/test/ for new public exports; new branches/error paths/edge cases (zero, MAX_UINT256, negative bigints); modified/removed exports without test updates; onchain code paths with at least one fork/mock test; snapshot/schema tests updated when generated outputs change. Uses PROJECT_CONTEXT when present.

8. Aggregate. Count ${CYCLE_FAILED_AGENTS} (any agent that returned {"agent_error": "..."}). Deduplicate findings (3-line tolerance). Keep highest severity for same file+line. Sort by file path ASC, line number ASC, severity DESC.

9. POST REVIEW to GitHub as a single atomic call:
   Build a JSON file at /tmp/pr-review-<PR_NUMBER>-comments.json with commit_id=${CYCLE_HEAD_SHA} (NOT a CronCreate-time SHA), event="COMMENT", body (summary table), and comments[] array (one entry per finding with path, line, side="RIGHT", body).
   If ${CYCLE_FAILED_AGENTS} > 0, prepend "> WARNING: ${CYCLE_FAILED_AGENTS} of 7 agents failed — review may be incomplete." to the body.
   Run: gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --method POST --input /tmp/pr-review-<PR_NUMBER>-comments.json — abort cycle if non-zero exit.
   Clean up: rm -f /tmp/pr-review-<PR_NUMBER>-comments.json

10. OPTIONAL CODEX: If `which codex` succeeds, run codex review in background. Validate <HEAD_BRANCH>/<BASE_BRANCH> match ^[A-Za-z0-9._/-]+$ before substitution; skip with a warning if not.

11. Say "Sentinel: WATCH_REVIEW_DONE — PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low)." — single grep-able line per cycle.

CYCLE END — the cron scheduler will run this again in 2 minutes.
```

**After CronCreate returns the job ID:**

1. Report the job ID to the user
2. Tell them they can cancel with `CronDelete` using that ID
3. Note that the watcher auto-expires after 3 days
4. Only THEN is the skill complete

## Smoke tests for `--local --fix` and the watcher

These recipes complement the "Validating --local end-to-end" table at the top of the file. They cover the new behaviors added in iter-5/iter-6 (whitespace-only guard, stale-stash check + bypass, stash-pop conflict path).

**Whitespace-only ASSEMBLED_PROMPT guard (Step 9 watcher CronCreate pre-flight):**

```bash
# Same three cases as /pr-fix's smoke test — the guard is identical:
ASSEMBLED_PROMPT='' bash -c '<paste the pre-flight guard>'              # WATCH_REJECTED
ASSEMBLED_PROMPT=$'\n  \t\n' bash -c '<paste the pre-flight guard>'     # WATCH_REJECTED
ASSEMBLED_PROMPT='actual content' bash -c '<paste the pre-flight guard>' # exit 0, no sentinel
```

**Stale-stash check + bypass env var (Step 7 alt 2b Check 1):**

```bash
# Case (a): clean — no safety stash exists.
/pr-review --local --fix         # expect: proceeds normally

# Case (b): stale safety stash present — abort.
git stash push -u -m "pr-review --local --fix safety stash"
/pr-review --local --fix         # expect: Sentinel: FIX_ABORTED — 1 stale ... entries detected: stash@{0}
                                 #         exit code 1

# Case (c): same state, with bypass env var — proceed.
PR_REVIEW_FIX_BYPASS_STALE_STASH=1 /pr-review --local --fix
                                 # expect: PR_REVIEW_FIX_BYPASS_STALE_STASH=1 — 1 'pr-review --local --fix safety stash' entry/entries present; bypassing ...

# Case (d): substring-only (NOT exact subject) — must NOT trip.
git stash drop stash@{0}
git stash push -u -m "my pr-review --local --fix safety stash backup"   # substring, not exact
/pr-review --local --fix         # expect: proceeds normally (grep -Fxq matches whole line only)

# Cleanup
git stash drop stash@{0}
```

**Stash-pop conflict path (Step 7 alt 2b restore-stash failure):**

```bash
# Synthetic: stash a change that conflicts with what the fix loop applies.
# 1. Edit fileA to value V1, stash it (this becomes the "pre-existing uncommitted work").
# 2. Run /pr-review --local --fix where the fix loop would also edit fileA to value V2.
# 3. The stash-pop fails with conflicts.
# Expected: Sentinel: FIX_DONE_WITH_STASH_CONFLICTS — <X> applied, stash@{0} unpopped due to conflicts in fileA ...
# Verify `git status` shows fileA in conflict state.
```

## Sentinel grammar registry

Every terminal step ends with a single grep-able `Sentinel: NAME — <human prose>` line. This registry is the single source of truth — adding a new sentinel requires adding a row here in the same PR.

### Stability policy

**Effective from this commit forward** (the registry was introduced in this skill upgrade; sentinels and trailer fields shipped before the registry have no retroactive deprecation obligation).

**Shell requirement**: pre-flight checks and watcher cycle commands use bash-only constructs (`${var//pattern/}` parameter substitution, `[[ ... ]]` tests, `set -euo`-friendly idioms). The skill's execution model assumes the agent's Bash tool runs `bash` (the default on macOS/Linux). Do NOT rewrite the prompt to be POSIX-portable without verifying the harness.

Downstream parsers (CI gates, dashboards, the `/pr-fix` companion skill) MAY rely on the grammar in this registry. Changes are governed as follows:

- **Patch / minor** (no breaking change): adding a new sentinel, adding a new field at the END of an existing trailer, fixing a trailer's prose without changing tokens or field order — all OK without a deprecation window. (Old parsers continue to match what they already match; new sentinels/fields are simply unseen by them.)
- **Major** (breaking change): renaming a sentinel, removing a field, changing field order, narrowing the value space of a field (e.g. removing `PENDING_TIMEOUT` from `ci=`). REQUIRES the 4-step deprecation flow used elsewhere in the repo (AGENTS.md §7), in canonical order: introduce successor → mark the old `@deprecated` in this registry (Status column) → maintain BOTH the old and the new for one minor → remove the old in the next major.
- **Cross-skill changes** (a sentinel is shared between `/pr-review` and `/pr-fix`): the change must land in BOTH registries in the same PR. The "Drift reminder" sections in both skills name the cross-references that govern this.

**Deprecation marking convention.** When a sentinel enters its 4-step deprecation flow, mark its row in the registry table as follows:
- Strikethrough the sentinel name: `~~SENTINEL_NAME~~`.
- Append `(deprecated, removal: <next-major-version-or-date>; superseded by NEW_SENTINEL_NAME)` at the END of the existing trailer-grammar cell.
- Keep the row visible until the next major release removes it — that's how the "maintain BOTH for one minor" step is observable to downstream parsers.

Example row (hypothetical retired sentinel, illustration only — don't ship this):

| `~~OLD_SENTINEL~~` | <step> | <fire condition> | `<existing trailer> (deprecated, removal: 2.0.0; superseded by NEW_SENTINEL)` |

| Sentinel | Owning step | Fires on | Trailer grammar |
|---|---|---|---|
| `REVIEW_CLEAN` | Step 7 (alt 2) | Local-only mode, zero findings, zero agent failures | `— no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `REVIEW_INCOMPLETE` | Step 7 (alt 2) | Local-only mode, zero findings BUT some agents crashed | `— <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.` |
| `REVIEW_DONE_LOCAL` | Step 7 (alt 2) | Local-only mode, non-zero findings | `— <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `REVIEW_DONE_PR` | Step 8 | CI / Local PR modes, end of run | `— PR #<PR_NUMBER>, <N> findings, mode=<CI\|LocalPR>, commit=<HEAD_SHA_SHORT>` |
| `FIX_DONE_LOCAL` | Step 7 (alt 2b) | `--local --fix` happy path | `— <X> applied, <Y> skipped (Local-only, unstaged).` |
| `FIX_DONE_WITH_STASH_CONFLICTS` | Step 7 (alt 2b) | `--local --fix` after `git stash pop` conflict | `— <X> applied, stash@{0} unpopped due to conflicts in <files>; resolve manually before running again.` |
| `FIX_ABORTED` | Step 7 (alt 2b) pre-flight | Stale safety stash detected, OR `git stash push` failed | `— <reason>` |
| `WATCH_REJECTED` | Step 9 pre-flight | Empty prompt OR un-substituted CronCreate-time placeholder | `— <reason>` |
| `WATCH_TRANSIENT_ERROR` | Step 9 watcher (any cycle command) | Any non-zero exit from a `Run:` line inside the cycle | `— step <N> (<command>): <stderr>` |
| `WATCH_PR_CLOSED` | Step 9 watcher Step 1 | PR is no longer in OPEN state | `— PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting.` |
| `WATCH_REVIEW_CLEAN` | Step 9 watcher Step 3 | No new commits since last review | `— PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review.` |
| `WATCH_REVIEW_DONE` | Step 9 watcher Step 11 | Review posted for a new commit | `— PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low).` |

`/pr-fix` owns its own sentinel set (`FIX_DONE_PR`, `RECONCILE_OK`, `RECONCILE_FAILED`, `WATCH_FIX_DONE`, `WATCH_FIX_GREEN`, `WATCH_LINT_FAILED`, plus shared `WATCH_REJECTED` / `WATCH_TRANSIENT_ERROR` / `WATCH_PR_CLOSED`); see `pr-fix.md`'s registry for grammar.

## Error Handling

- If the PR doesn't exist: tell the user and stop
- If the diff is too large for agents: split by file groups and review in batches
- If posting review fails (e.g., permissions): fall back to posting a single PR comment with all findings using `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`
- If an agent fails: continue with results from other agents, note which aspect was skipped
- If CronCreate is not available: skip continuous monitoring, inform the user that `--watch` requires CronCreate

## Notes

- **Three modes**: **CI mode** (in GitHub Actions, with `<PR_NUMBER>`) submits a formal verdict + markers and does not support `--watch`. **Local PR mode** (locally, with `<PR_NUMBER>`) posts as `COMMENT` and optionally supports `--watch`. **Local-only mode** (`--local`, no `<PR_NUMBER>`) prints findings to the terminal — no GitHub interaction at all — and optionally applies fixes locally with `--fix`. `--local` and `--watch` are mutually exclusive.
- **Adaptive context**: Step 4 reads the root `AGENTS.md` (canonical) and `MISSION.md` for the engineering rules and intent, plus the per-package `AGENTS.md` / `README.md` / `ARCHITECTURE.md` / nested `AGENTS.md` only for packages touched by the diff. Per-package `AGENTS.md` refines the root for that package; the root wins on contradictions. The `docs/jsdoc-style.md` rules apply whenever an exported symbol or any JSDoc / `@example` is touched. `docs/tibs/TEMPLATE.md` is read only when a TIB-style doc is touched.
- **Per-package context is targeted, not exhaustive**: Only AGENTS.md/README.md/ARCHITECTURE.md for packages with changed files are read — context stays bounded for big monorepos. The root rules always apply.
- **Pairs with `/pr-fix`**: Run `/pr-review --local` before opening a PR for fast feedback; or `/pr-review <PR>` after opening for an inline GitHub review. Then `/pr-fix <PR>` applies posted comments. With `--watch`, the loop is autonomous.
- **Local-first**: Always use local filesystem and git commands for reading code, diffs, and file contents. In Local-only mode, never call the GitHub API. In PR modes, only use the GitHub API for posting reviews/comments (write operations). Never use the GitHub API to read diffs or file contents — the local repo has everything.
- **Unified command**: This command replaces the old separate `/review` (CI-only) and `/pr-review` (local-only) commands. It auto-detects the environment/flags and adapts its behavior.
- **CI mode differences**: In CI, the review submits a formal verdict (`APPROVE` or `REQUEST_CHANGES`), includes `CLAUDE_REVIEW_COMPLETE` markers, and does not support `--watch`. In Local PR mode, the review always posts as `COMMENT` and optionally supports `--watch`. In Local-only mode, no review is posted anywhere.
- **Self-contained watcher**: The cron watcher performs the full review inline (launches agents, posts review) rather than re-invoking the skill. This avoids recursive watcher creation and ensures each cron tick is a complete review cycle.
- Always review the FULL PR diff, not just the latest commit — this ensures context and cross-file impact are considered
- Each re-review posts a new review (GitHub keeps the history)
- This skill works on any repository — it detects owner/repo from git remote automatically
- The skill assumes it is invoked from within the git repository

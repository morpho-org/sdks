# pr-review-local

Pre-PR local code review. Output to terminal only — no GitHub interaction. Optionally apply fixes once with `--fix`, or loop review→fix→re-review with `--goal` until the review passes cleanly.

## Usage

```
/pr-review-local                       # review current branch vs default base
/pr-review-local <BASE_BRANCH>         # review against an explicit base branch
/pr-review-local --fix                 # review and apply fixes once (unstaged; refuses on dirty tree)
/pr-review-local --goal                # loop review->fix->re-review, commit each iteration, until clean
/pr-review-local --goal --max-iters 8  # raise the loop ceiling (default 5)
/pr-review-local --fast                # skip the documentation agent (cheapest meaningful cut)
/pr-review-local <BASE_BRANCH> --fix   # flags combine freely
```

`<BASE_BRANCH>` is positional and must NOT begin with `--`. Flag order is otherwise free.

`--fast` excludes the `documentation` agent via the engine's `<EXCLUDE_AGENTS>` input — the most expensive lens per launch and the most likely to return clean on code-focused diffs. Use the default (full panel) when the diff touches Markdown, the §10 inventory, or public-API docs.

`--goal` is the autonomous loop: it reviews, fixes `critical`/`high`/`medium` findings, re-gates (format → lint → typecheck → test, **scoped to the changed surface** — see Goal mode), commits, and re-reviews until no actionable findings remain. It commits each iteration and therefore refuses on a dirty tree. `--goal` supersedes `--fix` (loop-and-commit beats single-shot-unstaged); if both are passed, `--goal` wins. There is **no post-convergence runtime check / `--no-runtime`** here — this is a headless SDK with no route-reachable UI, so no dev server is ever booted.

## Validating end-to-end

A maintainer changing this skill should verify each outcome shape:

| Scenario | Expected last line |
|---|---|
| Clean branch, no findings | `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings present | `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings + agent crash | `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` (with a `WARNING: <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete.` line prepended to the findings output) |
| Zero findings + agent crash | `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.` |
| `--fix` happy path | `Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).` plus `git diff` shows the unstaged edits. |
| `--fix` aborted on dirty tree | `Sentinel: FIX_ABORTED — working tree is not clean. Commit or stash before --fix.` |
| `--goal` converges | `Sentinel: GOAL_CLEAN — review passes cleanly after <i> iteration(s) on <HEAD_BRANCH> vs <BASE_BRANCH>; <K> low finding(s) triaged (not auto-fixed).` plus one `fix(review): iteration N` commit per fixing pass. |
| `--goal` on already-clean branch | `Sentinel: GOAL_CLEAN — ... after 1 iteration(s) ...` (idempotent: no commits made). |
| `--goal` aborted on dirty tree | `Sentinel: GOAL_ABORTED — working tree is not clean; commit or stash before --goal.` |
| `--goal` aborted on detached HEAD | `Sentinel: GOAL_ABORTED — detached HEAD; check out a branch before --goal.` |
| `--goal` aborted on red base gate | `Sentinel: GOAL_ABORTED — base gate is red (<TEST_CMD> fails before any fix); fix it or run without --goal.` |
| `--goal` same findings twice | `Sentinel: GOAL_STUCK — identical findings on iteration <i> and <i-1>; stopping for user input.` |
| `--goal` hits the ceiling | `Sentinel: GOAL_MAXED — <N> actionable finding(s) remain after <MAX_ITERS> iteration(s); extend, accept, or stop?` |
| Re-run, input unchanged (cache hit) | cached findings reprinted under a `(cached — input unchanged since <head_sha>)` header + a reuse/re-review prompt; on *reuse*, the matching `REVIEW_*` sentinel from the cached counts (Step 2c — single-shot only) |

Idempotency: re-running with an unchanged input (same merge-base + head SHA + worktree) short-circuits via the Step 2c cache and reprints the cached findings + sentinel without re-running agents; finding *text* never drifts on a cache hit because nothing is recomputed. A genuine change misses the cache and runs a fresh review.

## Step 1: Validate environment + arguments

```bash
if [ "$CI" = "true" ] || [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "pr-review-local is for pre-PR local review. In CI use /pr-review-ci." >&2
  exit 1
fi
```

Parse positional and flag args:

- If `--fix` is present, set `FIX=1`.
- If `--goal` is present, set `GOAL=1` (autonomous loop — see the **Goal mode** section). `--goal` supersedes `--fix`: if both are present, set `GOAL=1` and ignore `FIX`.
- If `--max-iters <N>` is present, set `MAX_ITERS=<N>`; otherwise default `MAX_ITERS=5`. Only meaningful with `--goal`.
- If `--fast` is present, set `FAST=1`.
- If a non-flag positional argument is present and does not start with `--`, treat it as `<BASE_BRANCH>`. (The numeric value following `--max-iters` is its argument, not the positional base branch.)

## Step 2: Resolve branches

```bash
# Fetch refs. If SSH auth fails (e.g. the 1Password / ssh-agent is down), retry
# the SAME fetch over HTTPS via `git -c remote.origin.url=…` (NOT a bare
# `git fetch <url>`, which only moves FETCH_HEAD) so origin's refspec runs and
# refs/remotes/origin/* actually update. Still git-only — the zero-GitHub
# contract holds. Stop loudly if HTTPS also fails (never review on stale refs).
if ! git fetch origin; then
  https_url=$(node .agents/pr-review-engine/scripts/review-scope.ts --to-https "$(git remote get-url origin)")
  echo "git fetch origin failed; retrying over HTTPS: $https_url" >&2
  git -c remote.origin.url="$https_url" fetch origin \
    || { echo "fetch failed over SSH and HTTPS — refs may be stale; fix auth/network before reviewing." >&2; exit 1; }
fi

HEAD_BRANCH=$(git branch --show-current)
if [ -z "$HEAD_BRANCH" ]; then
  HEAD_BRANCH=$(git rev-parse --short HEAD)   # detached HEAD — display only
fi
HEAD_SHA=$(git rev-parse HEAD)
```

Resolve `<BASE_BRANCH>`:

1. If a positional argument was provided, use it.
2. Otherwise auto-detect the repo's default branch:

```bash
BASE_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | sed 's/.*: //' | tr -d '[:space:]')
if [ -z "$BASE_BRANCH" ]; then
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
      BASE_BRANCH=$candidate
      break
    fi
  done
fi
if [ -z "$BASE_BRANCH" ]; then
  echo "Could not resolve base branch. Pass one explicitly: /pr-review-local <BASE_BRANCH>" >&2
  exit 1
fi
```

**Empty-diff short-circuit.** Compute the actual commit-range diff before any review work, and stop only if it is empty AND the working tree is clean. Branch-name equality alone is NOT sufficient — a clean tree on `main` with unpushed commits ahead of `origin/main` still has changes to review:

```bash
MERGE_BASE=$(git merge-base origin/<BASE_BRANCH> HEAD)
COMMIT_RANGE_FILES=$(git diff --name-only "$MERGE_BASE..HEAD")
WORKTREE_DIRTY=$(git status --porcelain)
if [ -z "$COMMIT_RANGE_FILES" ] && [ -z "$WORKTREE_DIRTY" ]; then
  echo "No changes to review on <HEAD_BRANCH> vs <BASE_BRANCH>"
  exit 0
fi
```

## Routing: goal mode vs single-shot

- If `GOAL=1` → **skip Steps 2c, 7, and 7b entirely** and follow the **Goal mode** section below. That section drives the engine (Steps 3–6) once per iteration and owns its own output and ledger handling.
- Otherwise → **Step 2c (idempotency cache)**, then Steps 3–6 once, then Step 7 (and Step 7b if `FIX=1`).

## Step 2c: Idempotency cache (single-shot path; short-circuit unchanged re-runs)

Before fanning out the agent panel, check whether the review input is byte-identical to the last recorded run — if so, reuse the cached findings instead of reproducing them. Goal mode skips this (it runs its own loop). The ledger lives **outside** the repo, keyed by branch:

```bash
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')   # owner/repo
LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-branch-$(printf '%s' "$HEAD_BRANCH" | tr '/ ' '-').json"
MERGE_BASE=$(git merge-base "origin/<BASE_BRANCH>" HEAD)
# Run identity = merge-base + head SHA + the CONTENT of the uncommitted overlay
# (content, not porcelain — editing an already-modified file must miss the cache).
RUN_HASH=$(node .agents/pr-review-engine/scripts/review-scope.ts --run-hash --base "$MERGE_BASE")

# Fail open: on any error fall through to a normal review — never skip the review
# on an unreadable cache result.
CACHE_JSON=$(node .agents/pr-review-engine/scripts/findings-ledger.ts \
  --ledger "$LEDGER" --check-cache --run-hash "$RUN_HASH") || CACHE_JSON=""
```

- **`cache_hit` true** → do NOT run Steps 3–6. Reprint the returned `findings` + `counts` as the Step 7 output, header marked `(cached — input unchanged since the last review of <head_sha>)`, then ask the user: **reuse this, or force a fresh review?** On *reuse* → emit the matching `REVIEW_*` sentinel from the cached counts and stop. On *force* → fall through to Steps 3–6 as a normal run.
- **`cache_hit` false** OR `CACHE_JSON` empty/missing `cache_hit` (the check errored) → proceed to Steps 3–6 normally.

Carry `RUN_HASH` forward to Step 6b so the fresh run is recorded.

## Steps 3–6: Shared review base

**Read `.agents/pr-review-engine/SKILL.md` and follow Steps 3–6 there**, with:

- `<DIFF_SOURCE>` = `local` (include uncommitted diff)
- `<HEAD_REF>` = `HEAD`
- `<EXCLUDE_AGENTS>` = `["documentation"]` when `FAST=1`, otherwise empty
- `<INTENT_CONTEXT>` = changed-commit messages only, built locally (let agents tell a deliberate, commit-documented change from a regression). Built from `git` only — never `gh` (the zero-GitHub contract). Empty when the branch has no commits beyond the merge-base:
  ```bash
  git log --format='%h %s%n%b' "$MERGE_BASE..HEAD"
  ```

Steps 3–6 produce: `<FINDINGS>`, `<DROPPED_FINDINGS>`, `<FAILED_AGENTS>`, `<COUNTS>`, `<DROPPED_COUNTS>`, `<TOTAL_AGENTS_LAUNCHED>`.

## Step 6b: Findings ledger (stateful re-runs)

Re-running on an evolving branch shouldn't re-surface findings you've already seen or deliberately deferred. Merge this run's findings into the persisted, branch-keyed ledger. This runs in the **single-shot path only** — goal mode tracks progress across its own iterations via `prev_findings_hash` and stamps the ledger once at convergence (see Goal mode). Write the Step 6 `<FINDINGS>` array to `/tmp/pr-review-local-findings.json`, then:

```bash
# --write persists the updated ledger; --run-hash (from Step 2c) records this run's
# input identity so the next unchanged re-run can short-circuit. If the merge fails,
# fall back to the plain stateless Step 7 output — never assume unpersisted state.
node .agents/pr-review-engine/scripts/findings-ledger.ts \
  --ledger "$LEDGER" --findings /tmp/pr-review-local-findings.json --head-sha "$HEAD_SHA" --run-hash "$RUN_HASH" --write \
  || echo "findings-ledger failed; continuing with the plain (stateless) Step 7 output." >&2
```

The merge prints `net_new` / `recurring` / `resolved` / `suppressed`. Feed them into Step 7:

- **Drop every `suppressed` (wontfix) finding from the displayed list** — that is the entire point of the manual wontfix mark.
- Tag each surfaced finding **NEW** (its id is in `net_new`) or leave untagged (in `recurring` — seen in an earlier run).
- **If the merge command failed**, skip the ledger annotations entirely and emit the plain Step 7 output — do not invent NEW/seen tags from state that wasn't persisted.

The ledger lives **outside** the repo, so the zero-GitHub and clean-tree contracts hold. **Marking a finding wontfix:** set its `status` to `"wontfix"` in the ledger JSON by hand (no flag); future runs auto-suppress it.

## Step 7: Output to terminal

Format directly in the conversation:

```
## Local-only Code Review

**Branch:** <HEAD_BRANCH> -> <BASE_BRANCH>  |  **Files:** <count>  |  **Range:** <MERGE_BASE_SHORT>..<HEAD_SHA_SHORT>
**Uncommitted files included:** <U>  |  **Mode:** Local-only
**Ledger:** <net_new> new · <recurring> seen before · <resolved> resolved since last run · <suppressed> wontfix-suppressed

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

Group findings by file (already sorted by Step 6). Within each file, list highest-severity findings first. Anchor each finding's `L<line>` on its `snapped_line` when present.

**Ledger annotations (from Step 6b).** Drop every `suppressed` (wontfix) finding from these sections entirely. Prefix each finding whose id is in `net_new` with a `**[NEW]**` tag (findings in `recurring` carry no tag). The `**Ledger:**` header line summarizes the four counts. When Step 6b did not run (no commits, or the ledger is unreadable), omit the `**Ledger:**` line and the `[NEW]` tags rather than guessing.

### Audit trail (dropped findings)

If `<DROPPED_FINDINGS>` is non-empty, after the per-file sections print a one-line summary:

```
Audit: dropped <N> finding(s) by scope filter (<out_of_scope> file-level, <pre_existing> line-level, <doc_example> doc-example). Full list: /tmp/pr-review-local-dropped.json
```

Write the `<DROPPED_FINDINGS>` array to `/tmp/pr-review-local-dropped.json` (each entry tagged with `drop_reason` and, for line-level drops, `distance_to_nearest_changed_line`) so the user can `cat` it and re-introduce a finding if the filter was wrong. Skip the line entirely when zero findings were dropped.

### Sentinel lines

- Zero findings AND zero agent failures → `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.`
- Zero findings BUT non-zero agent failures → `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.`
- Non-zero findings → `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` If `<FAILED_AGENTS>` is also non-zero, prepend a single `WARNING: <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete.` line to the findings output BEFORE the sentinel.

When `FIX=1`: suppress the `REVIEW_DONE_LOCAL` sentinel (Step 7b will emit its own terminal sentinel). `REVIEW_CLEAN` / `REVIEW_INCOMPLETE` still print before falling through — they're honest summaries even when fixes are about to be applied.

If `FIX=1`, proceed to **Step 7b**. Otherwise the skill is complete here.

## Step 7b: Apply fixes (only with --fix)

### Pre-condition: refuse on dirty tree

The previous version of this skill stashed any uncommitted user work, applied fixes, then popped the stash. That dance handled a 3-condition edge case (uncommitted work + crashed prior run + lint rejection) and added ~80 lines of stash plumbing. We mirror `/pr-fix`'s cleaner stance: refuse to run on a dirty tree.

```bash
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "Sentinel: FIX_ABORTED — working tree is not clean. Commit or stash before --fix." >&2
  echo "Pre-existing uncommitted file(s):" >&2
  printf '%s\n' "$DIRTY" >&2
  exit 1
fi
```

If the user wants to keep their work-in-progress, they `git stash push -u`, run `--fix`, then `git stash pop`. The skill stays out of stash management entirely.

### Apply fixes

**Batch by file** — process all findings on a given file as one unit, validate once, revert all-or-nothing. This avoids the silent-destruction bug where a per-finding revert (`git checkout -- <file>`) would wipe earlier successful fixes on the same file along with the failing one.

For each file with findings (files in any order; findings within a file ordered highest severity first):

1. Read the file from the local filesystem.
2. Apply EVERY finding for this file via the Edit tool, accumulating edits.
3. Validate the file once with the project linter:
   ```bash
   pnpm exec biome check <file>
   ```
4. **All-or-nothing revert.** If lint passes, mark every finding for this file as `applied`. If lint fails, run `git checkout -- <file>` to revert the entire file (safe because the pre-condition guarantees the working tree was clean before the loop), and mark every finding for this file as `skipped: lint rejected the batch`. Do NOT report partial success — the user sees a consistent picture in `git diff`.
5. Track per-file outcomes: applied count, skipped count, skip reason.

### Report

```
## Fix Summary (Local-only)

Mode: Local-only (no PR, no commit, no push)
Fixed: X findings
Skipped: Y findings (see notes above)

Changes are unstaged. Review with: git diff
```

End with the sentinel:

```
Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).
```

### Hard constraints

- Do NOT stage changes (`git add`).
- Do NOT commit.
- Do NOT push.
- Leave all changes as unstaged modifications so the user can review them with `git diff`.

## Goal mode (`--goal`): review → fix → re-review loop

Reached only when `GOAL=1` (the Routing section diverts here after Step 2 — Steps 2c, 7, and 7b do **not** run in goal mode). This is the autonomous-completion loop: review, fix the actionable findings, re-gate, commit, and re-review until the review passes cleanly.

**"Passes cleanly" = no `critical`/`high`/`medium` findings remain.** `low` findings are never auto-fixed — they are carried to the final summary for the user to triage.

> **Autonomous, not careless.** Goal mode stops and asks the user on a stuck loop, an exhausted iteration budget, or a pre-existing red gate. It never commits broken state and never sweeps unrelated dirty changes into a commit.

### Gate commands (this repo — resolve once, before the loop)

The repo has no `format`/`typecheck` npm scripts, its `test` script runs Vitest in **watch** mode, and `pnpm lint` is pre-existing-red on the frozen deprecated packages (§11) for reasons unrelated to any change. So do **not** use bare `pnpm lint` / `pnpm test` as gates — pin these, each **scoped to the changed surface** so the loop converges on the change rather than tripping on pre-existing breakage:

- `<FORMAT_CMD>` = `pnpm exec biome check --write <changed files>` (or the resolved binary `node_modules/@biomejs/biome/bin/biome`). Format may mutate files freely.
- `<LINT_CMD>` = `pnpm exec biome check <changed files>` — scoped to the diff's files. NOT the full `pnpm lint` (it bundles `jsdoc:coverage:check` + `lint:address` + a whole-repo `biome check` that is pre-existing-red on frozen deprecated packages).
- `<TYPECHECK_CMD>` = `tsc --noEmit` scoped to the touched surface: `.agents/pr-review-engine/scripts/tsconfig.json` for engine-script changes, or the touched package's `tsconfig.json` (`pnpm --filter <pkg> exec tsc --noEmit`). Skip with a one-line warning if no tsconfig covers the change.
- `<TEST_CMD>` = the affected **non-watch** Vitest project only: `dotenv -- node node_modules/vitest/vitest.mjs run --project <name>` (e.g. `agents-engine` for engine-script changes; the touched package's project otherwise). **Never** bare `pnpm test` (watch mode) and **never** the full fork suite (needs `MAINNET_RPC_URL` + live RPC).

If a gate command is unresolvable for the change, skip that step with a one-line warning; never invent a command.

> **Package-manager pre-run-install guard.** `pnpm exec <tool>` can trigger pnpm's `verify-deps-before-run` → an implicit `pnpm install` that fails on a from-source native build and sinks an otherwise-green gate. Prefer the resolved binary (`node_modules/.bin/<tool>`), or disable the check (`pnpm --config.verify-deps-before-run=false exec <tool>` — flag before `exec` — or env `npm_config_verify_deps_before_run=false`). A failed pre-run install is a tooling failure to surface, not a gate result.

### Pre-flight gates (stop-and-ask)

Before the first iteration, check in order; every gate aborts with a `GOAL_ABORTED` sentinel and `exit 1`:

1. **Dirty working tree** — `git status --porcelain` non-empty → `Sentinel: GOAL_ABORTED — working tree is not clean; commit or stash before --goal.` The loop commits each iteration, so uncommitted WIP must not be swept into a `fix(review)` commit.
2. **Detached HEAD** — `git branch --show-current` empty → `Sentinel: GOAL_ABORTED — detached HEAD; check out a branch before --goal.`
3. **Pre-existing red gate** — run `<TEST_CMD>` once. If it already fails on the current branch, stop-and-ask:
   - On **decline** → `Sentinel: GOAL_ABORTED — base gate is red (<TEST_CMD> fails before any fix); fix it or run without --goal.` and `exit 1`.
   - On **proceed** → record the failing test IDs as a *pre-existing baseline*. The re-gate (loop step 6) then treats the gate as green so long as it produces no failures beyond that baseline.

### The loop

`prev_findings_hash = ""`. For `i = 1..MAX_ITERS` (default `5` — a ceiling, not a target; expect convergence by iteration 2–3):

1. **Review.** Run Steps 3–6 (the engine) with `<DIFF_SOURCE>=local`, `<HEAD_REF>=HEAD`, `<INTENT_CONTEXT>` = the commit-messages block from the Steps 3–6 inputs, and `<EXCLUDE_AGENTS> = ["documentation"]` when `FAST=1` (otherwise empty). (There is no `runtime-validation` agent in this repo, so nothing to exclude for it.)
2. **Partition.** `actionable` = findings with severity in `{critical, high, medium}`; set the `low` findings aside as the triage list.
3. **Success check.** If `actionable` is empty → **break, success** (carry the lows to the summary).
4. **Stuck check.** Hash `actionable` (sort by `file`, `line`, `description`; hash). If `hash == prev_findings_hash` → restore the tree (see *Leaving the branch clean*), then `Sentinel: GOAL_STUCK — identical findings on iteration <i> and <i-1>; stopping for user input.`, print the findings, and stop and ask the user.
5. **Fix.** Apply fixes `critical → high → medium`, **batched by file** (reuse Step 7b's batch-by-file, all-or-nothing-per-file discipline). Apply the smallest change that addresses each finding. Skip any finding that is ambiguous or needs more than a localized edit; carry it to the next iteration.
6. **Re-gate.** Run `<FORMAT_CMD>` → `<LINT_CMD>` → `<TYPECHECK_CMD>` → `<TEST_CMD>` (the scoped commands above). The latter three must end green (relative to the pre-existing baseline from gate 3, if any). **If green** → commit (step 7). **If non-green** → do **not** commit; the failing gate output becomes additional synthetic findings for the next iteration.
7. **Commit** (only when the gate is green): `fix(review): iteration <i> — <N> findings`.
8. Set `prev_findings_hash = hash`; continue.

If `i == MAX_ITERS` and `actionable` is still non-empty → restore the tree, then `Sentinel: GOAL_MAXED — <N> actionable finding(s) remain after <MAX_ITERS> iteration(s); extend, accept, or stop?`, print the residual findings, and ask the user.

### Leaving the branch clean on a non-success exit

Whenever goal mode stops **without** converging (`GOAL_STUCK`, `GOAL_MAXED`), restore the working tree to the last committed state *before* printing the sentinel:

```bash
git checkout -- .   # discard the current iteration's uncommitted edits to tracked files
git clean -fd       # AND remove any untracked files/dirs a fix created (else gate 1 still trips)
```

Safe because pre-flight gate 1 guaranteed a clean tree, so the only changes present are the loop's own edits. The stopping point is the last green `fix(review)` commit (or the original `HEAD` if none went green) — never a dirty, gate-red tree.

### Post-convergence ledger stamp (single write)

So a later **single-shot** `/pr-review-local` run inherits what `--goal` resolved (rather than re-surfacing it as net-new), stamp the branch-keyed ledger **once, here at convergence** — not per iteration. Write the converged `low` findings (the triage list — or `[]` when there are none) to `/tmp/pr-review-local-findings.json`, then merge with the converged HEAD's run-hash (same `LEDGER` key as Step 6b):

```bash
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-branch-$(printf '%s' "$HEAD_BRANCH" | tr '/ ' '-').json"
MERGE_BASE=$(git merge-base "origin/<BASE_BRANCH>" HEAD)
FINAL_HEAD=$(git rev-parse HEAD)   # the last fix(review) commit; tree is clean here
RUN_HASH=$(node .agents/pr-review-engine/scripts/review-scope.ts --run-hash --base "$MERGE_BASE")
node .agents/pr-review-engine/scripts/findings-ledger.ts \
  --ledger "$LEDGER" --findings /tmp/pr-review-local-findings.json --head-sha "$FINAL_HEAD" --run-hash "$RUN_HASH" --write \
  || echo "goal-mode ledger stamp failed (non-fatal); the converge result still stands." >&2
```

Best-effort — a failed stamp is non-fatal. Skip the stamp when no commits were made (already-clean branch).

### Final summary

On a clean converge, print a summary and the terminal sentinel:

```
## Goal-mode Review (pr-review-local --goal)

Branch:        <HEAD_BRANCH> -> <BASE_BRANCH>
Iterations:    <i> (clean on iteration <i>)
Commits:       <M> (fix(review): iteration N)
Low findings:  <K> (not auto-fixed — listed below for manual triage)

Low findings (manual triage — omit when K=0):
  <file>:<line> — <description>
  ...

Sentinel: GOAL_CLEAN — review passes cleanly after <i> iteration(s) on <HEAD_BRANCH> vs <BASE_BRANCH>; <K> low finding(s) triaged (not auto-fixed).
```

### Hard constraints (goal mode)

- Commit each fixing iteration; never `git add`/commit a partial or gate-red state.
- Do NOT push and do NOT open a PR — the branch is left ready for the user.
- Never auto-fix `low` findings; only triage-list them.
- Commits are conventional (`fix(review): ...`) and signed if the repo configures signing.

## Notes

- **No GitHub interaction**. The skill never calls `gh api`. All output stays in the terminal.
- **Refuse on dirty tree** for both `--fix` and `--goal`. Clean precondition replaces ~80 lines of stash plumbing and a class of stash-pop-conflict bugs.
- **No runtime check.** This is a headless SDK monorepo with no route-reachable UI; goal mode never boots a dev server, so there is no post-convergence runtime stage and no `--no-runtime` flag.

## Sentinel grammar

| Sentinel | Owning step | Trailer grammar |
|---|---|---|
| `REVIEW_CLEAN` | Step 7 | `— no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` (zero findings, zero agent failures) |
| `REVIEW_INCOMPLETE` | Step 7 | `— <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.` |
| `REVIEW_DONE_LOCAL` | Step 7 | `— <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `FIX_DONE_LOCAL` | Step 7b | `— <X> applied, <Y> skipped (Local-only, unstaged).` |
| `FIX_ABORTED` | Step 7b pre-flight | `— working tree is not clean. Commit or stash before --fix.` |
| `GOAL_CLEAN` | Goal mode final summary | `— review passes cleanly after <i> iteration(s) on <HEAD_BRANCH> vs <BASE_BRANCH>; <K> low finding(s) triaged (not auto-fixed).` |
| `GOAL_ABORTED` | Goal mode pre-flight (gate 1) | `— working tree is not clean; commit or stash before --goal.` |
| `GOAL_ABORTED` | Goal mode pre-flight (gate 2) | `— detached HEAD; check out a branch before --goal.` |
| `GOAL_ABORTED` | Goal mode pre-flight (gate 3) | `— base gate is red (<TEST_CMD> fails before any fix); fix it or run without --goal.` |
| `GOAL_STUCK` | Goal mode loop (stuck check) | `— identical findings on iteration <i> and <i-1>; stopping for user input.` |
| `GOAL_MAXED` | Goal mode loop (budget exhausted) | `— <N> actionable finding(s) remain after <MAX_ITERS> iteration(s); extend, accept, or stop?` |

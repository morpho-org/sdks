# pr-review-local

Pre-PR local code review. Output to terminal only — no GitHub interaction. Optionally apply fixes with `--fix`.

## Usage

```
/pr-review-local                       # review current branch vs default base
/pr-review-local <BASE_BRANCH>         # review against an explicit base branch
/pr-review-local --fix                 # review and apply fixes (refuses on dirty tree)
/pr-review-local <BASE_BRANCH> --fix   # both
```

`<BASE_BRANCH>` is positional and must NOT begin with `--`. Flag order is otherwise free.

## Validating end-to-end

A maintainer changing this skill should verify each outcome shape:

| Scenario | Expected last line |
|---|---|
| Clean branch, no findings | `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings present | `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| Findings + agent crash | `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.` |
| `--fix` happy path | `Sentinel: FIX_DONE_LOCAL — <X> applied, <Y> skipped (Local-only, unstaged).` plus `git diff` shows the unstaged edits. |
| `--fix` aborted on dirty tree | `Sentinel: FIX_ABORTED — working tree is not clean. Commit or stash before --fix.` |

Idempotency: re-running with no diff change produces the same sentinel + same counts; finding *text* may drift (LLM nondeterminism). The sentinel structure is deterministic.

## Step 1: Validate environment + arguments

```bash
if [ "$CI" = "true" ] || [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "pr-review-local is for pre-PR local review. In CI use /pr-review-ci." >&2
  exit 1
fi
```

Parse positional and flag args:

- If `--fix` is present, set `FIX=1`.
- If a non-flag positional argument is present and does not start with `--`, treat it as `<BASE_BRANCH>`.

## Step 2: Resolve branches

```bash
git fetch origin

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

If `<HEAD_BRANCH>` equals `<BASE_BRANCH>` AND `git status --porcelain` is empty, inform the user `No changes to review on <HEAD_BRANCH> vs <BASE_BRANCH>` and stop.

## Steps 3–6: Shared review base

**Read `.agents/lib/pr-review-base.md` and follow Steps 3–6 there**, with:

- `<DIFF_SOURCE>` = `local` (include uncommitted diff)
- `<HEAD_REF>` = `HEAD`

Steps 3–6 produce: `<FINDINGS>`, `<FAILED_AGENTS>`, `<COUNTS>`.

## Step 7: Output to terminal

Format directly in the conversation:

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

### Sentinel lines

- Zero findings AND zero agent failures → `Sentinel: REVIEW_CLEAN — no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.`
- Zero findings BUT non-zero agent failures → `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.`
- Non-zero findings → `Sentinel: REVIEW_DONE_LOCAL — <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.`

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

For each finding from Step 7, starting from highest severity:

1. Read the file from the local filesystem.
2. Apply the suggested fix using the Edit tool.
3. Validate with the project linter:
   ```bash
   pnpm exec biome check <file>
   ```
4. If the fix breaks linting, revert the edit (use `git checkout -- <file>` — safe because the pre-condition guarantees the working tree was clean before the loop) and skip the finding.
5. Track which findings were fixed and which were skipped.

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

## Notes

- **No GitHub interaction**. The skill never calls `gh api`. All output stays in the terminal.
- **Refuse on dirty tree** for `--fix`. The previous stash-and-pop machinery is gone — clean precondition replaces ~80 lines of stash plumbing and a class of stash-pop-conflict bugs.
## Sentinel grammar

| Sentinel | Owning step | Trailer grammar |
|---|---|---|
| `REVIEW_CLEAN` | Step 7 | `— no issues found in <HEAD_BRANCH> vs <BASE_BRANCH>.` (zero findings, zero agent failures) |
| `REVIEW_INCOMPLETE` | Step 7 | `— <FAILED_AGENTS> of 7 agents failed (<names>); no findings does NOT mean clean.` |
| `REVIEW_DONE_LOCAL` | Step 7 | `— <N> findings (X critical, Y high, Z medium, W low) on <HEAD_BRANCH> vs <BASE_BRANCH>.` |
| `FIX_DONE_LOCAL` | Step 7b | `— <X> applied, <Y> skipped (Local-only, unstaged).` |
| `FIX_ABORTED` | Step 7b pre-flight | `— working tree is not clean. Commit or stash before --fix.` |

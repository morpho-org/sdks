# pr-fix

Apply fixes for unresolved PR review comments, resolve merge conflicts with the base branch, commit, push, resolve threads, and monitor CI. Optionally watches for new review comments and re-applies fixes automatically.

## Usage

```
/pr-fix <PR_NUMBER>
/pr-fix <PR_NUMBER> --watch
```

## Examples

```
/pr-fix 123
/pr-fix 456 --watch
```

> **TWO-PHASE SKILL**: Phase 1 (Steps 1-11, including the Step 9.5 reconciliation pass) does the initial fix pass. Phase 2 (Step 12) creates a continuous watcher via CronCreate if `--watch` was passed. If `--watch` is used, the skill is NOT complete until Step 12's CronCreate call succeeds and you report the job ID to the user.

## Placeholder convention

Throughout this skill, the following placeholders are used consistently:

| Placeholder | Source | Description |
|---|---|---|
| `<OWNER>` | parsed from git remote | GitHub repo owner |
| `<REPO>` | parsed from git remote | GitHub repo name |
| `<PR_NUMBER>` | user argument | Pull request number |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` | PR base branch |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` | PR head branch |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid` | Head commit full SHA |
| `<HEAD_SHA_SHORT>` | first 7 chars of `<HEAD_SHA>` | Head commit short SHA |
| `<REPO_PATH>` | `git rev-parse --show-toplevel` | Absolute path to repo root |

## Step 1: Detect Repository

Extract owner and repo from the git remote:

```bash
git remote get-url origin
```

Parse `<OWNER>` and `<REPO>` from the URL (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git` formats). Strip the `.git` suffix.

## Step 2: Fetch PR Details and Checkout Branch

### 2a: Check for clean working tree

Before switching branches, verify the working tree is clean — abort the skill entirely if there are uncommitted changes (or if `git status` itself fails):

```bash
STATUS_OUT=$(git status --porcelain 2>&1)
if [ $? -ne 0 ]; then
  echo "git status failed: $STATUS_OUT" >&2
  exit 1
fi
if [ -n "$STATUS_OUT" ]; then
  echo "Working tree is not clean. Please commit or stash your changes before running /pr-fix." >&2
  exit 1
fi
```

### 2b: Fetch PR metadata

Use local `gh` CLI to get PR metadata, capturing the exit code and validating that all four required fields are non-empty:

```bash
PR_JSON=$(gh pr view <PR_NUMBER> --json title,baseRefName,headRefName,headRefOid,state 2>&1)
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

Validate that `<BASE_BRANCH>`, `<HEAD_BRANCH>`, and `<HEAD_SHA>` are all non-empty before proceeding (an empty `baseRefName` would silently corrupt every downstream `git`/`gh` command, e.g. `git merge --no-commit origin/` with empty branch). Abort with `gh pr view returned malformed JSON` if any field is empty.

If `state` is not `OPEN`, inform the user and stop.

### 2c: Fetch and checkout the PR branch

Use `gh pr checkout` (cross-fork-safe — handles both existing and new local branches, and PRs from forks):

```bash
git fetch origin
gh pr checkout <PR_NUMBER>
```

This creates the local branch from the remote if needed, or switches to it if it already exists. It also handles PRs originating from forks correctly.

**Post-condition check (CRITICAL):** verify the checkout actually landed on the expected commit. `gh pr checkout` can fail mid-fetch (network blip, fork remote missing, auth expiry) and leave the working tree on the wrong branch with partial fetch state — in which case every later step runs against the wrong code.

```bash
ACTUAL_HEAD=$(git rev-parse HEAD)
if [ "$ACTUAL_HEAD" != "<HEAD_SHA>" ]; then
  echo "gh pr checkout did not land on expected commit." >&2
  echo "Expected: <HEAD_SHA>" >&2
  echo "Got:      $ACTUAL_HEAD" >&2
  echo "Aborting before any fix is applied. Re-run /pr-fix after investigating." >&2
  exit 1
fi
```

**Note:** This will leave you on the PR branch when the skill finishes. The original branch is not restored automatically.

## Step 3: Check and Resolve Merge Conflicts

### 3a: Check for merge conflicts with the base branch

```bash
git merge --no-commit --no-ff origin/<BASE_BRANCH> 2>&1
```

### 3b: If there are no conflicts (or already up to date)

Abort the test merge only if one is active, then continue to Step 4:

```bash
# Only abort if MERGE_HEAD exists (a merge is in progress)
git rev-parse --verify MERGE_HEAD >/dev/null 2>&1 && git merge --abort || true
```

### 3c: If there are merge conflicts

The merge will report conflicting files. For each conflicting file:

1. **Read the file** with conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) using the Read tool
2. **Understand both sides**: The `HEAD` side is the PR branch changes, the `origin/<BASE_BRANCH>` side is the base branch changes
3. **Resolve the conflict** intelligently:
   - If the PR branch changes are newer/intentional, keep them
   - If the base branch introduced a necessary change (new import, renamed function, updated API), incorporate it
   - If both sides changed the same code for different reasons, merge both changes logically
   - Read surrounding files if needed to understand the intent of each side
4. **Edit the file** using the Edit tool to remove conflict markers and produce the correct merged result
5. **Validate the resolved file**: `pnpm exec biome check <file>`

After resolving all conflicts:

```bash
# Stage resolved files
git add <list of resolved files>

# Complete the merge
git commit -m "$(cat <<'EOF'
merge: resolve conflicts with <BASE_BRANCH>

Resolved merge conflicts in:
- <file1>
- <file2>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Push the merge commit
git push origin <HEAD_BRANCH>
```

Print a summary of resolved conflicts:

```
Resolved merge conflicts with <BASE_BRANCH>:
  - <file1>: <brief description of resolution>
  - <file2>: <brief description of resolution>
```

### 3d: If conflicts cannot be resolved automatically

If a conflict is too ambiguous to resolve safely (e.g., both sides rewrote the same function entirely with different logic):

1. Abort the merge: `git merge --abort`
2. Inform the user which files have unresolvable conflicts and why
3. Continue with Step 4 (review comment fixes) — the conflicts will need human intervention

## Step 4: Collect Unresolved Review Comments

Use `gh api graphql` to fetch all review threads on the PR. Include `pageInfo` so we can detect (and refuse to silently truncate) PRs with >100 threads:

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 50) {
              nodes {
                databaseId
                body
                path
                originalLine
                author { login }
              }
            }
          }
        }
      }
    }
  }' -f owner=<OWNER> -f repo=<REPO> -F pr=<PR_NUMBER>
```

**Pagination preflight (CRITICAL):** if `reviewThreads.pageInfo.hasNextPage` is `true`, abort with:

```
PR #<PR_NUMBER> has more than 100 review threads (pagination not implemented in this skill).
Threads beyond the first 100 would be silently dropped from the actionable set.
Please run /pr-fix manually on a smaller batch, or implement the pagination cursor here.
```

Do NOT proceed with truncated data — better to fail loud than to apply some fixes and silently leave threads unaddressed.

**Filter to only unresolved, non-outdated threads** (`isResolved: false` AND `isOutdated: false`).

For each unresolved thread, extract:

- `threadId` — the GraphQL node ID (for resolving later)
- `path` — the file the comment is on
- `line` — the line number (`originalLine`)
- `body` — use **the most recent comment** in the thread (last in the `comments.nodes` array) — it may contain updated guidance
- `commentId` — the `databaseId` of the **first** comment in the thread (for the `in_reply_to` reply target)
- `author` — who posted the comment (to identify source: Claude, Codex, Copilot, or human)

Group findings by file for efficient fixing.

**Empty-list early exit:** if the filtered list is empty, print `No unresolved comments to fix on PR #<PR_NUMBER>.` and skip directly to **Step 9.5** (reconciliation pass — to confirm there's nothing to address) and then **Step 11** (final report). If `--watch` was passed, ALSO continue to Step 12 (the watcher may pick up new comments later).

**Both Claude and Codex comments are handled.** Claude uses `**[SEVERITY]**` prefixes. Codex may use different formats. Human comments are also included.

## Step 5: Triage & Relevance Assessment

**Do NOT blindly fix every unresolved comment.** Each comment must pass relevance assessment before being queued for fixing. This prevents wasted effort, incorrect fixes, and regressions from applying stale or misunderstood suggestions.

### 5a: Classify comment kind (and parse severity)

For each unresolved thread, classify the **most recent comment** into one of these categories:

| Category | Action | Examples |
|---|---|---|
| **Actionable fix** | Queue for fixing | "Use `bigint` for the amount", "Missing `.js` suffix on relative import", "Wrong SDK type" |
| **Question / Clarification** | Skip — reply acknowledging, leave unresolved | "Why was this approach chosen?", "Is this intentional?", "What happens if X?" |
| **Discussion / Opinion** | Skip — leave for human | "I'd prefer X over Y", "We should discuss whether...", "Not sure about this pattern" |
| **Praise / Acknowledgment** | Skip — resolve thread | "LGTM", "Nice refactor", "Good catch" |
| **Already addressed** | Skip — resolve with note | Comment refers to code that was changed in a subsequent commit |
| **Stale / Inapplicable** | Skip — reply explaining | Comment references code that no longer exists at that location |

**If classification is ambiguous, default to SKIP (leave for human review) rather than applying a potentially wrong fix.**

While classifying, parse severity case-insensitively from the comment body:

- **Claude comments**: `**[CRITICAL]**`, `**[HIGH]**`, `**[MEDIUM]**`, `**[LOW]**` prefix format
- **Codex comments**: May use `severity:` fields, `[issue]`/`[suggestion]` tags, or plain text — infer severity from language (e.g., "bug", "security" → HIGH; "nit", "consider" → LOW)
- **Human comments**: Treat as HIGH by default unless they use language suggesting lower priority

Priority order:

1. **CRITICAL** — must fix
2. **HIGH** — must fix
3. **MEDIUM** — fix unless there's a good reason not to
4. **LOW** — fix if straightforward

### 5b: Check code freshness

For each comment classified as "actionable fix," verify the referenced code still exists and is unchanged:

```bash
# Check if the file still exists
test -f <path>
```

Using the Read tool, read the file at `path` and examine the area around `originalLine`. If:

- The file no longer exists → re-classify as **Stale**
- The code at that line has significantly changed (different logic, moved elsewhere) → re-classify as **Stale** and search for where the code moved to; only re-classify back to actionable if the same issue exists at the new location
- The code is substantially the same → proceed

### 5c: Check if already addressed

For each remaining actionable comment, check whether the issue was already fixed in a commit after the review:

```bash
# Get commits on the file since the review comment was created
git log --oneline --since="<comment_created_at>" -- <path>
```

If the most recent commit on the file is **after** the comment's `created_at`, mark the finding as "possibly already addressed" and require a verification re-read. Read the current state of the code at the referenced location — if the specific issue described in the comment (e.g., missing `.js` suffix, wrong type) is **no longer present in the current code**, classify as **Already addressed**.

### 5d: Print assessment summary (BEFORE applying any fix)

Print a summary to the user **before proceeding** — this gives them a chance to intervene:

```
PR #<PR_NUMBER> — Review Comment Assessment:

  Total unresolved threads: <N>
  Sources: X from Claude, Y from Codex, Z from humans

  Actionable fixes: <N>
    - <X> critical, <Y> high, <Z> medium, <W> low
  Skipped: <M>
    - <A> questions/discussions (leaving for human)
    - <B> stale/inapplicable (code changed)
    - <C> already addressed (will resolve)
    - <D> praise/acknowledgment (will resolve)

  Per-comment bucket counts:
  | Category            | Count |
  |---------------------|-------|
  | actionable          |   X   |
  | question            |   X   |
  | discussion          |   X   |
  | praise              |   X   |
  | already-addressed   |   X   |
  | stale               |   X   |

Proceeding with <N> actionable fixes...
```

### 5e: Gate — only proceed with actionable + not-already-addressed

Only proceed to Step 6 with comments classified as **actionable** AND **not already addressed**. All other categories are handled in Step 9 (replies) and Step 9.5 (reconciliation), not in Step 6 (fix application).

### 5f: Per-category routing table — used by Step 9

Step 9 implements one path per category from 5a. Memorize this routing table; do NOT collapse non-actionable categories into "skipped":

| Category | Step 9 path | Reply text | Resolve thread? |
|---|---|---|---|
| **Actionable fix** (after Step 6 applies it) | 9a | `Fixed in <HEAD_SHA> — <brief>` | yes |
| **Actionable fix** (skipped: low confidence, false positive, conflict) | 9c-skipped | `Skipped — <reason>. Leaving for human review.` | no |
| **Question / Clarification** | 9c-question | `Acknowledged — leaving for the author to answer.` | no |
| **Discussion / Opinion** | 9c-discussion | `Leaving this for human discussion.` | no |
| **Praise / Acknowledgment** | 9c-praise | (no reply needed) | yes |
| **Already addressed** | 9c-already | `Already addressed in <SHA-or-current-code>.` | yes |
| **Stale / Inapplicable** | 9c-stale | `Skipped — code referenced no longer exists at this location. Leaving for human review.` | no |

## Step 6: Apply Fixes

**Never apply a fix you don't fully understand. A skipped finding is always better than a wrong fix.**

For each actionable finding (from Step 5), grouped by file:

### 6a: Mandatory context-gathering (BEFORE any edit)

For each file with findings, build a complete understanding before touching anything:

1. **Read the project rules that govern this file** — these are authoritative; the fix must respect them:
   - Root `AGENTS.md` (canonical engineering rules; `CLAUDE.md` is a symlink — do not also read it).
   - `MISSION.md` (mission, scope, and values — explains *why* the rules exist).
   - **If the file lives under `packages/<pkg>/`**:
     - `packages/<pkg>/AGENTS.md` — package-specific refinements (these refine the root for this package; root wins on contradictions).
     - `packages/<pkg>/README.md` — public-facing usage.
     - `packages/<pkg>/ARCHITECTURE.md` — if present.
   - **If the file lives outside `packages/`** (root files, `.agents/commands/*`, `.github/workflows/*`, `scripts/*`, `docs/*`, etc.): use ONLY the root baseline (`AGENTS.md`, `MISSION.md`). Do NOT attempt to derive a synthetic package directory.
   - Any nested `AGENTS.md` along the path of the touched file (e.g. `packages/morpho-sdk/src/actions/AGENTS.md`, `packages/morpho-sdk/src/actions/marketV1/AGENTS.md`).

2. **Read the full file** — Use the Read tool. Understand the overall structure, not just the flagged line.

3. **Read all files imported by the target file** — For TypeScript/NodeNext, every relative import is a `./xxx.js` reference; resolve them and read the source. Focus on:
   - Type definitions, interfaces, or schemas referenced at the flagged location
   - Helper modules used inside the changed function

4. **Find callers** — use the **Grep tool** (preferred over raw grep — it handles regex metacharacters in symbol names safely). Search across `packages/**` (this monorepo has no top-level `test/` directory; tests live under `packages/*/test/` and colocated next to source in `morpho-sdk` / `evm-simulation`):

   ```bash
   # If you must use a shell, scope to packages/:
   grep -rn "<exported-symbol-name>" packages/
   ```

5. **If the change is in a public API**, read the corresponding `packages/<pkg>/src/index.ts` re-export entry point AND any test file under `packages/<pkg>/test/` that exercises the symbol.

6. **If the comment cites an originating commit/PR** (e.g., "introduced in #1234" or `git blame` output), read the other files touched by that commit for context:

   ```bash
   git log --oneline -5 -- <path>
   git show <commit>  # to see all files in the originating change
   ```

You do NOT need to read every transitive import — focus on files directly relevant to the specific fix.

### 6b: Confidence assessment (BEFORE any edit)

Before editing, write a one-line classification for the finding:

- **HIGH** — You fully understand the change and its blast radius. **Proceed.**
- **MEDIUM** — You understand the change but its blast radius is unclear. **Proceed but flag in the thread reply** that the fix should be double-checked.
- **LOW** — You don't fully understand the change or the suggestion's reasoning. **Skip.** Record as "skipped: low confidence" and continue to the next finding. Reply on the thread explaining what's unclear; leave it unresolved for human review.

### 6c: Apply the fix

Use the Edit tool to make the change. Follow the suggestion in the review comment. If the comment describes a problem but not a specific fix, use the context gathered in 6a to implement the correct solution.

**Rules:**

- Fix only what the comment asks for — don't refactor surrounding code
- Preserve existing code style (indentation, naming conventions, etc.)
- If a fix requires changes across multiple files (e.g., updating an interface), make all necessary changes
- If a finding is about missing tests, write the test
- If a finding cannot be fixed (e.g., it's a false positive or disagrees with project conventions), skip it and note it for Step 9
- If applying the fix would contradict another unresolved comment on the same code, skip both and flag the conflict for human review

### 6d: Validate the fix

After each file is modified, run the project linter:

```bash
pnpm exec biome check <file>
```

## Step 7: Quality Gate

After all fixes are applied, run broader quality checks:

```bash
# Lint (biome check + checksum-address)
pnpm lint

# Build (exercises tsc per package — there is no separate typecheck script)
pnpm -r --if-present build
```

If errors are found, fix them before proceeding.

## Step 8: Commit and Push

### 8a: Stage all changed files

```bash
git add <list of changed files>
```

Only stage files that were actually modified as part of the fixes.

Before committing, verify the staged set:

```bash
git diff --cached --name-only
```

Do not continue if unrelated files are staged.

### 8b: Create a single commit

```bash
git commit -m "$(cat <<'EOF'
fix: address PR review findings

Applied fixes for <N> review comments:
- <brief summary of key fixes>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 8c: Push to remote

```bash
git push origin <HEAD_BRANCH>
```

## Step 9: Reply to and Resolve Review Threads

For each finding that was fixed:

### 9a: Reply to the comment thread

Use a heredoc inside `$(cat <<'EOF' ... EOF)` to ensure real newlines (not literal `\n`):

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

Fixed in <HEAD_SHA> — <brief description of what was changed>
REPLY_EOF
)"
```

### 9b: Resolve the thread

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }' -f threadId=<threadId>
```

### 9c: For non-fixed findings — route per the Step 5f table

Each category gets a distinct reply + resolve action. Do NOT collapse them all into "skipped + leave open" — that contradicts Step 5f.

**9c-skipped (actionable but not applied — low confidence / false positive / convention conflict):** reply with reason, do NOT resolve.

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

Skipped — <reason why this was not fixed>. Leaving for human review.
REPLY_EOF
)"
```

**9c-question (Question / Clarification):** reply acknowledging, do NOT resolve. Author answers.

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

Acknowledged — leaving for the author to answer.
REPLY_EOF
)"
```

**9c-discussion (Discussion / Opinion):** reply noting it's left for humans, do NOT resolve.

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

Leaving this for human discussion.
REPLY_EOF
)"
```

**9c-praise (Praise / Acknowledgment):** no reply needed. Resolve the thread silently using the 9b mutation.

**9c-already (Already addressed):** reply noting where it was addressed, AND resolve the thread.

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

Already addressed in <SHA-or-current-code description>.
REPLY_EOF
)"
# then run the 9b resolve mutation
```

**9c-stale (Stale / Inapplicable):** reply noting the code moved/disappeared, do NOT resolve (leave for human to confirm).

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

Skipped — code referenced no longer exists at this location. Leaving for human review.
REPLY_EOF
)"
```

## Step 9.5: Reconcile All Current Open Threads

Fetch unresolved, non-outdated review threads again and make sure **every** current thread is explicitly addressed:

- **Fixed thread**: reply with commit SHA + resolve the thread
- **Skipped thread**: reply with skip reason + leave unresolved

Do not assume that replying to one duplicate comment is enough. If reviewers left the same finding on multiple lines/threads, reply to each thread individually.

Verification check:

- Fetch current unresolved, non-outdated threads
- Inspect the latest comment on each thread
- Confirm each thread has either a fix reply plus a resolved state, or a skip reply

Do not report success while any unresolved, non-outdated thread lacks either a fix reply + resolution or a skip reply.

## Step 10: Monitor CI After Push

### 10a: Wait briefly for CI to start

```bash
sleep 15
```

### 10b: Check CI status

```bash
gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO>
```

### 10c: If CI is still running

Poll up to 5 times with 30-second intervals:

```bash
gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO> --watch --fail-fast
```

If `--watch` is not available, poll manually using the documented `bucket` field. Track whether we exited the loop because checks finished or because we timed out — Step 11's report distinguishes these:

```bash
# Poll loop (up to 5 attempts, 30s apart). 5 * 30s = 2.5 min total.
CI_POLL_TIMED_OUT=1
for i in 1 2 3 4 5; do
  PENDING=$(gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO> --json name,bucket --jq '[.[] | select(.bucket == "pending")] | length')
  if [ "$PENDING" = "0" ]; then CI_POLL_TIMED_OUT=0; break; fi
  sleep 30
done
```

When `CI_POLL_TIMED_OUT=1`, Step 11's report MUST say:

```
CI: PENDING (timed out after 2.5min — re-check with `gh pr checks <PR_NUMBER>` later)
```

…NOT a bare `CI: PENDING` (which would imply a terminal state). The user needs to know the report is provisional.

### 10d: If CI fails

1. Get the failed check details and extract the run ID:
   ```bash
   # Get failed checks
   gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO> --json name,bucket,link --jq '.[] | select(.bucket == "fail")'

   # Extract run ID from the failed check's link URL
   RUN_ID=$(gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO> --json bucket,link --jq '.[] | select(.bucket == "fail") | .link | capture("/runs/(?<id>[0-9]+)") | .id' | head -1)
   ```
2. Fetch the CI logs for the failed job:
   ```bash
   gh run view "$RUN_ID" --repo <OWNER>/<REPO> --log-failed
   ```
3. Analyze the failure and determine if it was caused by the fix commit.
4. If the failure is caused by the fix:
   - Apply a corrective fix
   - Stage, commit with message `fix: address CI failure from review fixes`
   - Push again
   - Re-check CI (repeat 10b-10d, max 2 retries to avoid infinite loops)
5. If the failure is pre-existing (not caused by the fix commit): note it in the report but don't try to fix it.

### 10e: If CI passes

Continue to Step 11.

## Step 11: Report to User

Print a final summary:

```
PR #<PR_NUMBER> fixes applied and pushed.

Commit: <HEAD_SHA_SHORT>
Conflicts: <RESOLVED X files / NONE / UNRESOLVABLE>
Fixed: <N> findings (X from Claude, Y from Codex, Z from humans)
Skipped: <M> findings (see thread replies for reasons)
CI: <PASS/FAIL/PENDING>

Resolved threads: <N>
Left open for human review: <M>

Note: You are now on branch <HEAD_BRANCH>.
```

If conflicts were resolved, list each file and the resolution strategy.
If conflicts could not be resolved, list the files and why.
If any findings were skipped, list them with the reason.
If CI failed on a pre-existing issue, note it separately.
Also state whether every current unresolved, non-outdated thread was addressed in the reconciliation pass.

If `--watch` was NOT passed, the skill is complete here.

If `--watch` WAS passed, **you MUST proceed to Step 12**.

## Step 12: Schedule Continuous Watch (only with --watch)

**If `--watch` was passed, you MUST call `CronCreate` now.** Do not skip this step.

### Placeholder discipline (CRITICAL)

The watcher prompt embeds two kinds of placeholders. Substituting them incorrectly leads to either stale data or silent failure:

- **CronCreate-time placeholders** — substitute these BEFORE calling CronCreate. Static for the life of the watcher: `<PR_NUMBER>`, `<OWNER>`, `<REPO>`, `<REPO_PATH>`, `<HEAD_BRANCH>`, `<BASE_BRANCH>`.
- **Cycle-derived placeholders** — DO NOT substitute. These are computed by the watcher agent each cycle, in particular every commit SHA produced by THIS cycle's push. Written below as `${CYCLE_HEAD_SHA}`. Using a CronCreate-time `<HEAD_SHA>` here would freeze the SHA at watcher-creation time and every reply the watcher posts would reference the wrong (stale) commit.

**Pre-flight check before calling CronCreate**: scan the assembled prompt for any remaining `<[A-Z_]+>` substring. If any match, abort and re-render — DO NOT call CronCreate with un-substituted placeholders. (`${...}` placeholders are intentional and exempt from this scan.)

### Failure handling discipline

Every shell command in the cycle must have an exit-status check. On any failure, end the cycle with `Sentinel: WATCH_TRANSIENT_ERROR — <step>: <stderr>` and stop — do NOT proceed with stale or empty values.

### Drift reminder

Step 7 below replicates the Step 5–9 logic from the main fix flow, including the per-category routing table from Step 5f. Any future change to the main flow's triage/reply behavior MUST be propagated here in the same PR.

### CronCreate parameters

- cron: `*/2 * * * *`
- recurring: true
- prompt: The prompt below, with `<UPPERCASE>` placeholders substituted at CronCreate time and `${CYCLE_*}` placeholders left intact:

```
You are the PR fix watcher for PR #<PR_NUMBER> in <OWNER>/<REPO>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

Every shell command below must be checked for non-zero exit. On ANY non-zero exit, say "Sentinel: WATCH_TRANSIENT_ERROR — step <N> (<command>): <stderr>" and end this cycle. Do NOT proceed with stale or empty values.

CYCLE START:

1. CHECK PR STATE:
   ${PR_STATE}=$(cd <REPO_PATH> && gh pr view <PR_NUMBER> --json state --jq '.state') — abort cycle if gh fails or empty
   If ${PR_STATE} is not "OPEN": say "PR #<PR_NUMBER> is no longer open (state: ${PR_STATE}). Fix watcher done." and end.

2. FETCH AND SYNC:
   cd <REPO_PATH> && git fetch origin && gh pr checkout <PR_NUMBER> — abort cycle on any non-zero exit
   (`gh pr checkout` is cross-fork-safe — it handles fork PRs and existing local branches.)
   Post-condition: confirm `git rev-parse HEAD` matches the PR's expected head SHA (re-query via `gh pr view <PR_NUMBER> --json headRefOid --jq '.headRefOid'`); abort cycle if mismatch (partial checkout).

3. CHECK MERGE CONFLICTS:
   cd <REPO_PATH> && git merge --no-commit --no-ff origin/<BASE_BRANCH> 2>&1
   - If clean (or already up to date): run `git rev-parse --verify MERGE_HEAD >/dev/null 2>&1 && git merge --abort || true` and continue to step 4.
   - If conflicts: for each conflicting file, read it with the Read tool, resolve conflict markers using the Edit tool (keep PR changes if intentional, incorporate base changes if necessary, merge both logically). Then: `git add <resolved files>` and `git commit -m "merge: resolve conflicts with <BASE_BRANCH>"`, capture the resulting SHA into ${CYCLE_MERGE_SHA}, and `git push origin <HEAD_BRANCH>`. Report resolved files.
   - If conflicts are too ambiguous: `git merge --abort`, report which files, continue to step 4.

4. CHECK CI:
   ${FAILED_CHECKS}=$(cd <REPO_PATH> && gh pr checks <PR_NUMBER> --json name,bucket,link --jq '.[] | select(.bucket == "fail")') — abort cycle if gh fails (non-zero exit, distinct from "no failures")
   If ${FAILED_CHECKS} is non-empty:
   a. Extract run ID: ${RUN_ID}=$(gh pr checks <PR_NUMBER> --json bucket,link --jq '.[] | select(.bucket == "fail") | .link | capture("/runs/(?<id>[0-9]+)") | .id' | head -1)
   b. Get logs: `gh run view "${RUN_ID}" --repo <OWNER>/<REPO> --log-failed`
   c. If caused by a recent fix commit: apply corrective fix, commit "fix: address CI failure", capture new ${CYCLE_HEAD_SHA}, push (max 2 retries)
   d. If pre-existing: note it, do not fix

5. FETCH UNRESOLVED REVIEW COMMENTS using gh api graphql (same query shape as Step 4 of the main flow — request `pageInfo { hasNextPage endCursor }` and abort the cycle with WATCH_TRANSIENT_ERROR if `hasNextPage` is true; pagination not implemented inline). Required field set: id, isResolved, isOutdated, comments.nodes.{databaseId, body, path, originalLine, author.login}.
   Filter to threads where isResolved=false AND isOutdated=false.
   For each thread: extract threadId (the node id), path, line (originalLine), body (use the **most recent** comment in the thread for the latest guidance), commentId (databaseId of the **first** comment, for the in_reply_to reply target), author.
   Parse severity case-insensitively from the comment body.

6. EVALUATE:
   If zero unresolved comments AND CI passing AND no conflicts: say "Sentinel: WATCH_FIX_GREEN — PR #<PR_NUMBER> is green (no unresolved comments, CI passing, no conflicts)." and end this cycle.

7. APPLY FIXES for unresolved comments:

   **Never apply a fix you don't fully understand. A skipped finding is always better than a wrong fix.**

   **Confidence gate (BEFORE any edit):** For each unresolved comment, run the same triage as the main flow's Step 5a–5e:
   - Classify into one of: actionable / question / discussion / praise / already-addressed / stale.
   - For each actionable comment: read the file at the comment's path+line and verify the referenced code still exists / hasn't been already fixed in a later commit (`git log --oneline --since="<comment_created_at>" -- <path>`).
   - **Mandatory context-gathering:** read the project rules that govern the file (root AGENTS.md — canonical, CLAUDE.md is a symlink; MISSION.md; if file is under packages/<pkg>/, also packages/<pkg>/AGENTS.md/README.md/ARCHITECTURE.md; any nested AGENTS.md along the path of the touched file; for files outside packages/ the per-package step is skipped). Then read the FULL file, read all files imported by it, and use the Grep tool to find callers (this monorepo has no top-level test/ directory; tests live under packages/*/test/ and colocated next to source in morpho-sdk/evm-simulation). If the change is in a public API, also read packages/<pkg>/src/index.ts and any test file under packages/<pkg>/test/. You do NOT need to read every transitive import — focus on files directly relevant to the specific fix. Re-discover this context per cycle from THIS cycle's diff/touched files.
   - Assign confidence: HIGH (proceed), MEDIUM (proceed but flag in reply), LOW (SKIP — record as "skipped: low confidence", reply with what's unclear, leave thread unresolved).

   a. Group actionable+HIGH/MEDIUM comments by file. For each file: apply fix with Edit tool per the comment suggestion (using the context already gathered above).
   b. Run `pnpm exec biome check` on modified files (or `pnpm lint` for the project-wide check). Abort the cycle on lint failures (do not push broken code).
   c. Stage: `git add <changed files>` (verify only fix-related files are staged with `git diff --cached --name-only`; unstage unrelated files with `git reset HEAD <file>` if needed)
   d. Commit: `git commit -m "$(cat <<'INNEREOF'
fix: address PR review findings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
INNEREOF
)"`
   e. Push: `git push origin <HEAD_BRANCH>` — capture the pushed SHA into ${CYCLE_HEAD_SHA} (`${CYCLE_HEAD_SHA}=$(git rev-parse HEAD)`).

   f. **Per-category replies (use the routing table from main flow Step 5f):**

      - **Actionable + fixed** → reply with "Fixed in ${CYCLE_HEAD_SHA}" + resolve thread (mutation in step g).
      - **Actionable + skipped (low/medium-confidence skip)** → reply with skip reason + leave unresolved.
      - **Question** → reply "Acknowledged — leaving for the author to answer." + leave unresolved.
      - **Discussion** → reply "Leaving this for human discussion." + leave unresolved.
      - **Praise** → no reply, just resolve.
      - **Already-addressed** → reply "Already addressed in <SHA-or-current-code>." + resolve.
      - **Stale** → reply "Skipped — code referenced no longer exists at this location. Leaving for human review." + leave unresolved.

      All replies use heredoc-inline form for real newlines (substituting ${CYCLE_HEAD_SHA} as needed):
      ```
      gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
        --method POST \
        -F in_reply_to=<commentId> \
        -f body="$(cat <<'REPLYEOF'
> <abbreviated comment>

<reply text per category above — replace ${CYCLE_HEAD_SHA} with the captured value>
REPLYEOF
)"
      ```

   g. Resolve threads (categories: fixed / praise / already-addressed):
      `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<threadId>`

   h. Say "Sentinel: WATCH_FIX_DONE — PR #<PR_NUMBER> cycle complete: fixed <X>, skipped <Y>, questions <Q>, discussions <D>, praise <P>, already-addressed <A>, stale <S>. Pushed commit ${CYCLE_HEAD_SHA}, resolved <R> threads."

CYCLE END — the cron scheduler will run this again in 2 minutes.
```

**After CronCreate returns the job ID:**

1. Report the job ID to the user
2. Tell them they can cancel with `CronDelete` using that ID
3. Note that the watcher auto-expires after 3 days
4. Only THEN is the skill complete

## Error Handling

- If no unresolved review comments exist on first run: tell the user "No unresolved review comments found on PR #<number>." but still schedule the watcher if `--watch` was passed (comments may appear later from reviewers)
- If checkout fails (dirty working tree): warn the user and suggest stashing or committing first
- If push fails (e.g., branch protection): inform the user with the error
- If a fix introduces a syntax error: revert that specific change and skip the finding
- If resolving a thread fails: log the error but continue with other threads
- If CI fix retries exceed 2 attempts: stop retrying, report the failure, and leave it for the user
- If CronCreate is not available: skip continuous monitoring, inform the user that `--watch` requires CronCreate

## Notes

- **Context-aware, not blind**: Every comment is assessed for relevance before fixing. Comments are classified (actionable vs. question vs. discussion vs. stale), checked for code freshness, and verified not already addressed. Fixes are only applied with sufficient context and HIGH/MEDIUM confidence. Skipping is always preferred over a wrong fix.
- **Local-first**: All code reading and editing happens on the local filesystem. Only GitHub API is used for reading review comments (via GraphQL) and posting replies/resolving threads (write operations).
- **Handles all reviewers**: Picks up unresolved comments from Claude, Codex, Copilot, and human reviewers. Normalizes severity across different comment formats.
- **CI-aware**: Monitors CI after pushing fixes. Automatically diagnoses and fixes CI failures caused by the fix commit (up to 2 retries). Pre-existing CI failures are reported but not touched.
- **Conflict-aware**: Detects merge conflicts with the base branch before applying review fixes. Resolves conflicts intelligently by reading both sides and merging logically. Conflicts that can't be safely resolved are reported for human intervention.
- **Quality gates**: Runs `pnpm exec biome check` after each file fix and `pnpm lint && pnpm -r --if-present build` after all fixes. Ensures fixes don't introduce new issues.
- **Self-contained watcher**: The cron watcher does actual work inline (resolves conflicts, applies fixes, replies to threads, resolves threads) rather than re-invoking the skill. The reason is operational: cron-fired agents start with no conversation history, so the watcher prompt must be standalone. The watcher also performs relevance assessment on every cycle — it never blindly fixes.
- **Pairs with `/pr-review`**: `/pr-review --local` for pre-PR feedback (terminal-only, no GitHub), `/pr-review <PR>` for inline GitHub review after opening, `/pr-fix <PR>` to apply posted comments. With `/pr-review <PR> --watch` plus `/pr-fix <PR> --watch`, the review-fix loop is fully autonomous.
- Fixes are applied to the PR branch, not main/dev
- One commit for all fixes — keeps the PR history clean
- Each reply includes the commit SHA for traceability
- Skipped findings are explicitly noted but left unresolved for humans
- The cron watcher auto-expires after 3 days per system limits
- The skill assumes it is invoked from within the git repository

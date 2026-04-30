# pr-fix

Apply fixes for unresolved PR review comments, resolve merge conflicts with the base branch, commit, push, resolve threads, and monitor CI. Optionally watches for new review comments and re-applies fixes automatically.

## Usage

```
/pr-fix <pr-number>
/pr-fix <pr-number> --watch
```

## Examples

```
/pr-fix 123
/pr-fix 456 --watch
```

> **TWO-PHASE SKILL**: Phase 1 (Steps 1-11) does the initial fix pass. Phase 2 (Step 12) creates a continuous watcher via CronCreate if `--watch` was passed. If `--watch` is used, the skill is NOT complete until Step 12's CronCreate call succeeds and you report the job ID to the user.

## Step 1: Detect Repository

Extract owner and repo from the git remote:

```bash
git remote get-url origin
```

Parse `owner` and `repo` from the URL (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git` formats). Strip the `.git` suffix.

## Step 2: Fetch PR Details and Checkout Branch

Use local `gh` CLI to get PR metadata:

```bash
gh pr view <PR_NUMBER> --json title,baseRefName,headRefName,headRefOid,state
```

Extract:

- `baseRefName` — the base branch
- `headRefName` — the head/PR branch
- `headRefOid` — the head commit SHA
- `state` — must be `OPEN`

If the PR is not open, inform the user and stop.

Fetch and checkout the PR branch locally:

```bash
git fetch origin
git checkout <headRefName>
git pull origin <headRefName>
```

## Step 3: Check and Resolve Merge Conflicts

### 3a: Check for merge conflicts with the base branch

```bash
git merge --no-commit --no-ff origin/<baseRefName> 2>&1
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
2. **Understand both sides**: The `HEAD` side is the PR branch changes, the `origin/<baseRefName>` side is the base branch changes
3. **Resolve the conflict** intelligently:
   - If the PR branch changes are newer/intentional, keep them
   - If the base branch introduced a necessary change (new import, renamed function, updated API), incorporate it
   - If both sides changed the same code for different reasons, merge both changes logically
   - Read surrounding files if needed to understand the intent of each side
4. **Edit the file** using the Edit tool to remove conflict markers and produce the correct merged result
5. **Validate the resolved file**: `pnpm oxlint -c .oxlintrc.json <file>`

After resolving all conflicts:

```bash
# Stage resolved files
git add <list of resolved files>

# Complete the merge
git commit -m "$(cat <<'EOF'
merge: resolve conflicts with <baseRefName>

Resolved merge conflicts in:
- <file1>
- <file2>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"

# Push the merge commit
git push origin <headRefName>
```

Print a summary of resolved conflicts:

```
Resolved merge conflicts with <baseRefName>:
  - <file1>: <brief description of resolution>
  - <file2>: <brief description of resolution>
```

### 3d: If conflicts cannot be resolved automatically

If a conflict is too ambiguous to resolve safely (e.g., both sides rewrote the same function entirely with different logic):

1. Abort the merge: `git merge --abort`
2. Inform the user which files have unresolvable conflicts and why
3. Continue with Step 4 (review comment fixes) — the conflicts will need human intervention

## Step 4: Collect Unresolved Review Comments

Use `gh api graphql` to fetch all review threads on the PR:

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 10) {
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
  }' -f owner=<owner> -f repo=<repo> -F pr=<PR_NUMBER>
```

**Filter to only unresolved, non-outdated threads** (`isResolved: false` AND `isOutdated: false`).

For each unresolved thread, extract:

- `threadId` — the GraphQL node ID (for resolving later)
- `path` — the file the comment is on
- `line` — the line number (`originalLine`)
- `body` — the comment text (contains the finding and suggestion)
- `commentId` — the `databaseId` of the first comment (for replying)
- `author` — who posted the comment

Group findings by file for efficient fixing.

**Both Claude and Codex comments are handled.** Claude uses `**[SEVERITY]**` prefixes. Codex may use different formats. Human comments are also included.

## Step 5: Triage Findings

Sort unresolved findings by severity. Parse severity from the comment body:

- **Claude comments**: `**[CRITICAL]**`, `**[HIGH]**`, `**[MEDIUM]**`, `**[LOW]**` prefix format
- **Codex comments**: May use `severity:` fields, `[issue]`/`[suggestion]` tags, or plain text — infer severity from language (e.g., "bug", "security" -> HIGH; "nit", "consider" -> LOW)
- **Human comments**: Treat as HIGH by default unless they use language suggesting lower priority

Priority order:

1. **CRITICAL** — must fix
2. **HIGH** — must fix
3. **MEDIUM** — fix unless there's a good reason not to
4. **LOW** — fix if straightforward

Print a summary to the user before proceeding:

```
Found <N> unresolved review comments on PR #<number>:
  Sources: X from Claude, Y from Codex, Z from humans
  - X critical
  - Y high
  - Z medium
  - W low

Applying fixes...
```

## Step 6: Apply Fixes

For each unresolved finding, grouped by file:

### 6a: Read the file from local filesystem

Use the Read tool to read the full file content. Understand the surrounding context — don't fix in isolation.

### 6b: Apply the fix

Use the Edit tool to make the change. Follow the suggestion in the review comment. If the comment describes a problem but not a specific fix, use your judgment to implement the correct solution.

**Rules:**

- Fix only what the comment asks for — don't refactor surrounding code
- Preserve existing code style (indentation, naming conventions, etc.)
- If a fix requires changes across multiple files (e.g., updating an interface), make all necessary changes
- If a finding is about missing tests, write the test
- If a finding cannot be fixed (e.g., it's a false positive or disagrees with project conventions), skip it and note it for Step 9

### 6c: Validate the fix

After each file is modified, run the project linter:

```bash
pnpm oxlint -c .oxlintrc.json <file>
```

## Step 7: Quality Gate

After all fixes are applied, run broader quality checks:

```bash
# Typecheck
pnpm typecheck:interface

# Lint all modified files
pnpm oxlint -c .oxlintrc.json <file1> <file2> ...
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

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 8c: Push to remote

```bash
git push origin <headRefName>
```

## Step 9: Reply to and Resolve Review Threads

For each finding that was fixed:

### 9a: Reply to the comment thread

```bash
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -f body="> <abbreviated original comment>

Fixed in <commit_sha> — <brief description of what was changed>" \
  -F in_reply_to=<commentId>
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

### 9c: For skipped findings

If a finding was skipped (false positive, disagrees with conventions, etc.), reply explaining why it was not fixed, but do NOT resolve the thread — leave it for human review:

```bash
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -f body="> <abbreviated original comment>

Skipped — <reason why this was not fixed>. Leaving for human review." \
  -F in_reply_to=<commentId>
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
gh pr checks <PR_NUMBER> --repo <owner>/<repo>
```

### 10c: If CI is still running

Poll up to 5 times with 30-second intervals:

```bash
gh pr checks <PR_NUMBER> --repo <owner>/<repo> --watch --fail-fast
```

If `--watch` is not available, poll manually:

```bash
for i in 1 2 3 4 5; do
  STATUS=$(gh pr checks <PR_NUMBER> --repo <owner>/<repo> --json name,state --jq '[.[] | select(.state != "completed")] | length')
  if [ "$STATUS" = "0" ]; then break; fi
  sleep 30
done
```

### 10d: If CI fails

1. Get the failed check details:
   ```bash
   gh pr checks <PR_NUMBER> --repo <owner>/<repo> --json name,state,bucket,link --jq '.[] | select(.bucket == "fail")'
   ```
2. Fetch the CI logs for the failed job(s):
   ```bash
   gh run view <RUN_ID> --repo <owner>/<repo> --log-failed
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
PR #<number> fixes applied and pushed.

Commit: <short_sha>
Conflicts: <RESOLVED X files / NONE / UNRESOLVABLE>
Fixed: <N> findings (X from Claude, Y from Codex, Z from humans)
Skipped: <M> findings (see thread replies for reasons)
CI: <PASS/FAIL/PENDING>

Resolved threads: <N>
Left open for human review: <M>
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

Use `CronCreate` to schedule a recurring job every 2 minutes:

- cron: `*/2 * * * *`
- recurring: true
- prompt: The prompt below, with all variables filled in (replace all `<PLACEHOLDERS>` with actual values):

```
You are the PR fix watcher for PR #<PR_NUMBER> in <owner>/<repo>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

CYCLE START:

1. CHECK PR STATE:
   Run: cd <REPO_PATH> && gh pr view <PR_NUMBER> --json state --jq '.state'
   If not "OPEN": say "PR #<PR_NUMBER> is no longer open (state: <STATE>). Fix watcher done." and end.

2. FETCH AND SYNC:
   Run: cd <REPO_PATH> && git fetch origin && git checkout <HEAD_BRANCH> && git pull origin <HEAD_BRANCH>

3. CHECK MERGE CONFLICTS:
   Run: cd <REPO_PATH> && git merge --no-commit --no-ff origin/<BASE_BRANCH> 2>&1
   - If clean (or already up to date): run `git rev-parse --verify MERGE_HEAD >/dev/null 2>&1 && git merge --abort || true` and continue to step 4.
   - If conflicts: for each conflicting file, read it with the Read tool, resolve conflict markers using the Edit tool (keep PR changes if intentional, incorporate base changes if necessary, merge both logically). Then: `git add <resolved files>` and `git commit -m "merge: resolve conflicts with <BASE_BRANCH>"` and `git push origin <HEAD_BRANCH>`. Report resolved files.
   - If conflicts are too ambiguous: `git merge --abort`, report which files, continue to step 4.

4. CHECK CI:
   Run: cd <REPO_PATH> && gh pr checks <PR_NUMBER> --json name,state,bucket,link --jq '.[] | select(.bucket == "fail")'
   If CI failures exist:
   a. Get logs: `gh run view <RUN_ID> --repo <owner>/<repo> --log-failed`
   b. If caused by a recent fix commit: apply corrective fix, commit "fix: address CI failure", push (max 2 retries)
   c. If pre-existing: note it, do not fix

5. FETCH UNRESOLVED REVIEW COMMENTS using gh api graphql:
   Run:
   gh api graphql -f query='
     query($owner: String!, $repo: String!, $pr: Int!) {
       repository(owner: $owner, name: $repo) {
         pullRequest(number: $pr) {
           reviewThreads(first: 100) {
             nodes {
               id
               isResolved
               isOutdated
               comments(first: 10) {
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
     }' -f owner=<owner> -f repo=<repo> -F pr=<PR_NUMBER>

   Filter to threads where isResolved=false AND isOutdated=false.
   For each thread: extract threadId (the node id), path, line (originalLine), body, commentId (databaseId of first comment), author.

6. EVALUATE:
   If zero unresolved comments AND CI passing AND no conflicts: say "PR #<PR_NUMBER> is green — no unresolved comments, CI passing, no conflicts." and end this cycle.

7. APPLY FIXES for unresolved comments:
   a. Group by file. For each file: read with Read tool, apply fix with Edit tool per the comment suggestion.
   b. Run pnpm oxlint -c .oxlintrc.json on modified files.
   c. Stage: `git add <changed files>`
   d. Commit: `git commit -m "$(cat <<'INNEREOF'
fix: address PR review findings

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
INNEREOF
)"`
   e. Push: `git push origin <HEAD_BRANCH>`
   f. For each fixed comment, reply in-thread:
      `gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/comments --method POST -f body="> <abbreviated comment>\n\nFixed in <sha>" -F in_reply_to=<commentId>`
   g. Resolve each thread:
      `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<threadId>`
   h. For skipped findings, reply with skip reason but do NOT resolve the thread.
   i. Say "Fixed <N> findings, pushed commit <sha>, resolved <N> threads."

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

- **Local-first**: All code reading and editing happens on the local filesystem. Only GitHub API is used for reading review comments (via GraphQL) and posting replies/resolving threads (write operations).
- **Handles all reviewers**: Picks up unresolved comments from Claude, Codex, Copilot, and human reviewers. Normalizes severity across different comment formats.
- **CI-aware**: Monitors CI after pushing fixes. Automatically diagnoses and fixes CI failures caused by the fix commit (up to 2 retries). Pre-existing CI failures are reported but not touched.
- **Conflict-aware**: Detects merge conflicts with the base branch before applying review fixes. Resolves conflicts intelligently by reading both sides and merging logically. Conflicts that can't be safely resolved are reported for human intervention.
- **Quality gates**: Runs `pnpm oxlint` after each file fix and `pnpm typecheck:interface` after all fixes. Ensures fixes don't introduce new issues.
- **Self-contained watcher**: The cron watcher does actual work inline (resolves conflicts, applies fixes, replies to threads, resolves threads) rather than re-invoking the skill. This avoids recursive watcher creation and ensures each cron tick is a complete fix cycle.
- **Pairs with `/pr-review`**: `/pr-review` posts findings (from parallel Claude agents + optional Codex), `/pr-fix` applies fixes. With both using `--watch`, they form a fully autonomous review-fix loop.
- Fixes are applied to the PR branch, not main/dev
- One commit for all fixes — keeps the PR history clean
- Each reply includes the commit SHA for traceability
- Skipped findings are explicitly noted but left unresolved for humans
- The cron watcher auto-expires after 3 days per system limits
- The skill assumes it is invoked from within the git repository

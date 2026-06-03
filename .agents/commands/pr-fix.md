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

> **TWO-PHASE SKILL**: Phase 1 (Steps 1-11, including the reconciliation pass; if Step 4 finds zero unresolved comments, the flow short-circuits Steps 5-9 and jumps straight to the reconciliation step + Step 11) does the initial fix pass. Phase 2 (Step 12) creates a continuous watcher via CronCreate if `--watch` was passed. If `--watch` is used, the skill is NOT complete until Step 12's CronCreate call succeeds and you report the job ID to the user.

## Placeholder convention

Two classes of placeholders. Step 12 has a third — see "Placeholder discipline (CRITICAL)" inside Step 12 for the watcher's `<UPPERCASE>` (CronCreate-time) vs `${CYCLE_*}` (cycle-derived) distinction.

### Static (resolved once before any step that uses them)

| Placeholder | Source | Description |
|---|---|---|
| `<OWNER>` | parsed from git remote | GitHub repo owner |
| `<REPO>` | parsed from git remote | GitHub repo name |
| `<PR_NUMBER>` | user argument | Pull request number |
| `<BASE_BRANCH>` | `gh pr view` → `baseRefName` | PR base branch |
| `<HEAD_BRANCH>` | `gh pr view` → `headRefName` | PR head branch |
| `<HEAD_SHA>` | `gh pr view` → `headRefOid`. **Note**: in the watcher this is re-derived per cycle as `${CYCLE_HEAD_SHA}` from each cycle's push — do not bake the CronCreate-time value into reply text. | Head commit full SHA |
| `<HEAD_SHA_SHORT>` | first 7 chars of `<HEAD_SHA>` | Head commit short SHA |
| `<REPO_PATH>` | `git rev-parse --show-toplevel` | Absolute path to repo root |

### Computed at runtime (do NOT include in any pre-flight static-placeholder check)

| Placeholder | Source | Description |
|---|---|---|
| `<commentId>`, `<threadId>` | per-thread, from Step 4 GraphQL | GitHub IDs for replies / resolves |
| `<comment_created_at>` | per-thread, from Step 4 GraphQL (`createdAt` field) | Used by Step 5c freshness check |
| `<reason>`, `<brief>` | per-finding | Human-readable reason in skip / fix replies |
| `<file1>`, `<file2>`, `<list of resolved files>` | per-merge-conflict | Filenames in merge-conflict commit body |
| `<N>`, `<X>`, `<Y>`, `<Z>`, `<W>`, `<M>`, `<R>`, `<H>`, `<F>`, `<SK>`, `<Q>`, `<D>`, `<P>`, `<A>`, `<ST>` | report templates | counts in summary tables and sentinel lines |

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

Validate that `<BASE_BRANCH>`, `<HEAD_BRANCH>`, and `<HEAD_SHA>` are all non-empty AND not whitespace-only before proceeding (an empty OR whitespace-only `baseRefName` would silently corrupt every downstream `git`/`gh` command, e.g. `git merge --no-commit origin/` with empty branch, or `git fetch origin " "`). Use `[ -z "${X//[[:space:]]/}" ]` (not bare `[ -z "$X" ]`) so whitespace is rejected. Abort with `gh pr view returned malformed JSON` if any field fails the check.

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
                createdAt
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

**Mixed-purpose comments**: a single comment can carry BOTH a question AND a concrete actionable suggestion (e.g. *"Why are you using `any` here? This will break the type contract."*). When BOTH are clearly present:

- Take the **actionable** path — apply the fix (route 9a in Step 9) — provided context-gathering and confidence (Step 6) support it.
- In the reply, **also acknowledge the question** explicitly: `Fixed in <HEAD_SHA> — <brief>. (Re your question: <one-line answer or "leaving for the author to weigh in further".)`
- This is the ONLY case where an actionable+fixed reply may extend beyond the canonical `Fixed in <HEAD_SHA> — <brief>` shape from Step 5f. Document the mixed nature in the reply so reviewers know both halves were considered.

If the question and the actionable suggestion conflict (the question implies the suggestion is wrong), default to SKIP and acknowledge both in the reply — leave for human review.

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

### 5f: Per-category routing table (used by Step 9 and Step 12 watcher Step 7)

Step 5a defines seven terminal categories. Mixed-purpose (Question + Actionable; Step 5a) is a variant of actionable+fixed with extended reply text — same routing path. The table has eight rows: one per category (7) plus the Mixed-purpose variant. Reply text is the contract.

| Category (or variant) | Path | Exact reply text | Resolve thread? |
|---|---|---|---|
| **Actionable fix** (after Step 6 applies it) | 9a | `Fixed in <HEAD_SHA> — <brief>` | yes |
| **Actionable fix** (skipped: low confidence, false positive, conflict) | 9c-skipped | `Skipped — <reason>. Leaving for human review.` | no |
| **Question / Clarification** | 9c-question | `Acknowledged — leaving for the author to answer.` | no |
| **Discussion / Opinion** | 9c-discussion | `Leaving this for human discussion.` | no |
| **Praise / Acknowledgment** | 9c-praise | (no reply) | yes |
| **Already addressed** | 9c-already | `Already addressed in <SHA-or-current-code>.` | yes |
| **Stale / Inapplicable** | 9c-stale | `Skipped — code referenced no longer exists at this location. Leaving for human review.` | no |
| **Mixed-purpose VARIANT** (Question + Actionable) | 9a (extended) | `Fixed in <HEAD_SHA> — <brief>. (Re your question: <one-line answer>.)` | yes |

The watcher (Step 12 Step 7f) follows this same table, substituting `${CYCLE_HEAD_SHA}` for `<HEAD_SHA>` in the actionable+fixed and Mixed-purpose rows. Non-actionable rows (praise, already-addressed, stale, question, discussion) MUST NOT reference `${CYCLE_HEAD_SHA}` — it may be unset on cycles where no fix was applied.

## Step 6: Apply Fixes

> **Drift reminder**: `/pr-review-local --fix` (Step 7b in `.agents/commands/pr-review-local.md`) reimplements the apply-and-validate mechanics from this Step 6c–6d (read-then-Edit, biome check, no commit/push). Any change to 6c–6d that affects those mechanics must be propagated to `/pr-review-local`'s `--fix` flow in the same PR.

**Never apply a fix you don't fully understand. A skipped finding is always better than a wrong fix.**

For each actionable finding (from Step 5), grouped by file:

### 6a: Mandatory context-gathering (BEFORE any edit)

For each file with findings, build a complete understanding before touching anything:

1. **Read the project rules that govern this file** — these are authoritative; the fix must respect them:
   - Root `AGENTS.md` (canonical engineering rules; `CLAUDE.md` is a symlink — do not also read it).
   - `MISSION.md` (mission, scope, and values — explains *why* the rules exist).
   - **`docs/jsdoc-style.md`** — if the fix touches an exported symbol from any `packages/<pkg>/src/index.ts` re-export entry, an `@example` block, or any JSDoc comment. This is the canonical JSDoc style guide for the monorepo (operationalizes AGENTS.md §6). Backed by `docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md`.
   - **If the file lives under `packages/<pkg>/`**:
     - `packages/<pkg>/AGENTS.md` — package-specific refinements (these refine the root for this package; root wins on contradictions).
     - `packages/<pkg>/README.md` — public-facing usage.
     - `packages/<pkg>/ARCHITECTURE.md` — if present.
   - **If the file lives outside `packages/`** (root files, `.agents/commands/*`, `.github/workflows/*`, `scripts/*`, `docs/*`, etc.): use the root baseline (`AGENTS.md`, `MISSION.md`, `CONTRIBUTING.md`, `biome.json`, plus `docs/jsdoc-style.md` if applicable). Do NOT attempt to derive a synthetic package directory. (Same scope as `.agents/lib/pr-review-base.md` Step 4's "Always read" baseline so the two skills agree on what context applies to outside-packages files.)
   - Any nested `AGENTS.md` along the path of the touched file (e.g. `packages/morpho-sdk/src/actions/AGENTS.md`, `packages/morpho-sdk/src/actions/blue/AGENTS.md`).
   - **CI / release files** — if the fix touches `.github/workflows/**`, `.github/actions/**`, `.changeset/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, or a `package.json` `scripts.*publish*` / `scripts.*release*` field, AGENTS.md §10 (Review automation & CI/release security) is the source-of-truth rule set. The `ci-release-security` persona at `.agents/personas/ci-release-security.md` enforces it at review time; the same rules govern a fix's correctness.
   - **Persona / spec-layering files** — if the fix touches `AGENTS.md` itself or any file under `.agents/personas/`, the bidirectional-backlink invariant from the `documentation` persona at `.agents/personas/documentation.md` applies: every persona's `applies:` frontmatter must match the corresponding `> Applied by personas:` callout in AGENTS.md, and vice versa. A fix to one side must atomically update the other.

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

Before editing, write a one-line classification for the finding. Always prefix with `Confidence:` so the tokens never collide with severity (which uses the bare same words `Critical`/`High`/`Medium`/`Low`):

- **`Confidence: HIGH`** — You fully understand the change and its blast radius. **Proceed.**
- **`Confidence: MEDIUM`** — You understand the change but its blast radius is unclear. **Proceed but flag in the thread reply** that the fix should be double-checked.
- **`Confidence: LOW`** — You don't fully understand the change or the suggestion's reasoning. **Skip.** Record as "skipped: low confidence" and continue to the next finding. Reply on the thread explaining what's unclear; leave it unresolved for human review.

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

## Step 9: Reply to and resolve review threads

For each thread classified in Step 5a, look up its row in the Step 5f routing table and send the reply + (optionally) resolve the thread.

### Reply mechanism

Heredoc-inline form for real newlines. Substitute `<commentId>` from Step 4 and any per-finding fields (`<brief>`, `<reason>`, `<SHA-or-current-code>`, `<one-line answer>` for Mixed-purpose) BEFORE the heredoc; the single-quoted `REPLY_EOF` blocks shell expansion inside the body:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/comments \
  --method POST \
  -F in_reply_to=<commentId> \
  -f body="$(cat <<'REPLY_EOF'
> <abbreviated original comment>

<reply text from Step 5f, with <HEAD_SHA> and any per-finding fields substituted>
REPLY_EOF
)"
```

### Resolve mechanism

```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }' -f threadId=<threadId>
```

Resolves fire for: actionable+fixed (incl. Mixed-purpose), praise, already-addressed. Leave unresolved for: actionable+skipped, question, discussion, stale.

Track bucket counts (`<F>`, `<SK>`, `<Q>`, `<D>`, `<P>`, `<A>`, `<ST>`, `<R>` = total resolved = `<F>` + `<P>` + `<A>`) for use in Step 9.5 and Step 11.

## Step 9.5: Reconcile All Current Open Threads

> Numbering note: Step 9.5 is a follow-on pass that runs AFTER Step 9 has finished routing each thread but BEFORE the final report (Step 11). It is not a variant or alternative of Step 9. The fractional number signals that relationship.

Fetch unresolved, non-outdated review threads again and make sure **every** current thread is in one of the seven Step-5a terminal categories (or the Mixed-purpose variant of actionable+fixed) defined in Step 5f. Do NOT collapse the categories into "fixed vs. skipped" — that contradicts Step 5f and will mis-handle praise / already-addressed / question / discussion threads.

For each open thread, confirm it landed in exactly one of these terminal states (eight rows, one per Step 5f routing row):

| Step 5f category | Terminal state — confirm BOTH |
|---|---|
| Actionable + fixed (incl. Mixed-purpose) | last comment matches `Fixed in <SHA> — <brief>` AND thread `isResolved == true` |
| Actionable + skipped | last comment matches `Skipped — <reason>. Leaving for human review.` AND thread `isResolved == false` |
| Question | last comment matches `Acknowledged — leaving for the author to answer.` AND thread `isResolved == false` |
| Discussion | last comment matches `Leaving this for human discussion.` AND thread `isResolved == false` |
| Praise | thread `isResolved == true` AND no new bot reply since the last praise comment |
| Already addressed | last comment matches `Already addressed in <SHA-or-current-code>.` AND thread `isResolved == true` |
| Stale | last comment matches `Skipped — code referenced no longer exists at this location. Leaving for human review.` AND thread `isResolved == false` |

If reviewers left the same finding on multiple lines/threads, each thread is its OWN terminal state — reply to each individually. Do not assume one duplicate reply covers them.

Verification check (run before reporting success):

- Re-fetch current unresolved, non-outdated threads (+ the just-resolved ones, to verify their terminal state).
- For each thread, inspect the latest bot comment AND the `isResolved` flag.
- Match against the table above. Any thread that does NOT match exactly one row is a defect — do not report success. First, attempt to re-route the thread through Step 9. If re-routing is not possible (the thread's terminal state truly cannot be classified), collect ALL such defective thread IDs into a single summary sentinel and stop with: `Sentinel: RECONCILE_FAILED — <N> threads in unknown state: <id1> <id2> <id3>.` (One sentinel per run, listing every defective thread space-separated — a single grep-able terminal line, matching the field-with-count grammar used by other sentinels. No brackets or commas — keeps the line shell-friendly for ad-hoc `for id in ...` recovery loops.)

On clean pass, emit `Sentinel: RECONCILE_OK — <N> threads addressed (<F> fixed-and-resolved, <SK> skipped-with-reply, <Q> questions, <D> discussions, <P> praise-resolved, <A> already-addressed-resolved, <ST> stale-skipped).` so a maintainer (or CI) can grep that this pass actually ran (vs. being silently skipped via the empty-list early-exit path from Step 4). The bucket counts and label set match WATCH_FIX_DONE so a downstream parser handles both with the same regex.

On the empty-list early-exit path from Step 4 (no unresolved comments to address), this step still runs and emits `Sentinel: RECONCILE_OK — 0 threads addressed (0 fixed-and-resolved, 0 skipped-with-reply, 0 questions, 0 discussions, 0 praise-resolved, 0 already-addressed-resolved, 0 stale-skipped).` — confirms the reconciliation actually ran rather than being silently skipped.

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

Poll up to 5 times with 30-second intervals using the `gh pr checks --watch` subcommand flag (NOT to be confused with `/pr-fix --watch` from Step 12 — these are unrelated; the former is a `gh` CLI flag that polls until checks settle, the latter is the user-facing skill flag that schedules a recurring CronCreate job):

```bash
gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO> --watch --fail-fast
```

If the `gh pr checks --watch` subcommand flag is not available in the installed `gh` version, poll manually using the documented `bucket` field. Track whether we exited the loop because checks finished or because we timed out — Step 11's report distinguishes these:

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

Print a final summary that ends with a single grep-able sentinel line. Pick the leading line based on whether any fix was pushed:

- **Fix pushed** → `PR #<PR_NUMBER> fixes applied and pushed.`
- **No fix pushed** (Step 4 short-circuited on empty list, OR all actionable comments were skipped via Step 9c) → `PR #<PR_NUMBER> — no commit, no push.` The body's `Skipped: <M> findings (see thread replies for reasons)` line spells out the cause for the human reader.

```
<conditional leading line per the rule above>

Commit: <HEAD_SHA_SHORT>
Conflicts: <RESOLVED X files / NONE / UNRESOLVABLE>
Fixed: <N> findings (X from Claude, Y from Codex, Z from humans)
Skipped: <M> findings (see thread replies for reasons)
CI: <PASS/FAIL/PENDING (timed out after 2.5min — re-check)/NA>

Resolved threads: <R>
Left open for human review: <H>

Note: You are now on branch <HEAD_BRANCH>.

Sentinel: FIX_DONE_PR — PR #<PR_NUMBER>, fixed <N>, skipped <M>, resolved <R>, ci=<PASS|FAIL|PENDING|PENDING_TIMEOUT|NA>, commit=<HEAD_SHA_SHORT>
```

`ci=` value mapping:
- `PASS` — `CI_POLL_TIMED_OUT=0` and no failed checks.
- `FAIL` — `CI_POLL_TIMED_OUT=0` and at least one failed check.
- `PENDING` — checks still running but not timed out (rare — only if Step 10 was bypassed).
- `PENDING_TIMEOUT` — `CI_POLL_TIMED_OUT=1` (poll loop exhausted 5×30s without checks settling). Distinguish this from plain `PENDING` so callers know the report is provisional.
- `NA` — Step 10 was not run (e.g. the Step-4 empty-list early-exit path made no commit).

On the empty-list early-exit path (Step 4 → Step 9.5 → Step 11), Step 10 is skipped and no fix commit is made: emit `fixed=0, skipped=0, resolved=0, ci=NA, commit=<the PR's existing head SHA from Step 2b>`. If Step 2b's SHA capture is somehow unset, fall back to `commit=unknown` rather than letting an unrendered placeholder leak into the sentinel. The sentinel is still grep-able and clearly distinguishable from a "real" run.

The Step 9.5 reconciliation pass already emitted its own `Sentinel: RECONCILE_OK` line on success; this Step 11 sentinel is the terminal grep target for the whole `/pr-fix <PR>` (no `--watch`) run. The pair `Sentinel: RECONCILE_OK` + `Sentinel: FIX_DONE_PR` together attest a clean run.

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

The watcher prompt embeds three kinds of placeholders. Substituting them incorrectly leads to either stale data or silent failure:

- **CronCreate-time placeholders (must substitute BEFORE CronCreate)** — exactly this allowlist: `<PR_NUMBER>`, `<OWNER>`, `<REPO>`, `<REPO_PATH>`, `<HEAD_BRANCH>`, `<BASE_BRANCH>`. These six are static for the life of the watcher.
- **Cycle-derived (do NOT substitute)** — computed by the watcher agent each cycle. Written as `${CYCLE_HEAD_SHA}`, `${CYCLE_PR_STATE}`, `${CYCLE_FAILED_CHECKS}`, `${CYCLE_RUN_ID}`, `${CYCLE_MERGE_SHA}`, etc. The `CYCLE_` prefix is the convention — every cycle-local variable used in the watcher prompt below is named `CYCLE_*`. Using a CronCreate-time `<HEAD_SHA>` for any cycle-derived value would freeze it at watcher-creation time and every reply would reference the wrong (stale) commit.
- **Report templates (do NOT substitute, NOT placeholders)** — count tokens like `<N>`, `<X>`, `<Y>`, `<Z>`, `<W>`, `<M>`, `<R>`, `<H>`, `<F>`, `<SK>`, `<Q>`, `<D>`, `<P>`, `<A>`, `<ST>` (the same set listed in the top-of-file Computed-at-runtime placeholder table) and structural tokens like `<file>`, `<line>`, `<reason>`, `<step>`, `<command>`, `<stderr>`, `<commentId>`, `<threadId>`, `<file1>`, `<file2>` are LITERALS inside output sentinels and inline templates that the watcher agent fills in at run time. They are NOT CronCreate-time placeholders.

**Pre-flight check before calling CronCreate** — scan the assembled prompt for any remaining `<[A-Z_]+>` substring AND check it against the CronCreate-time allowlist above. ONLY abort if a remaining match is in the allowlist (i.e. should have been substituted). Do NOT abort on report-template tokens (`<N>`, `<X>`, etc.) or on structural tokens. The empty-prompt case must also abort loud — an unset `$ASSEMBLED_PROMPT` would silently pass the grep check (no input → no match → grep returns 1):

```
if [ -z "${ASSEMBLED_PROMPT//[[:space:]]/}" ]; then
  echo "Sentinel: WATCH_REJECTED — assembled prompt is empty, unset, or whitespace-only; refusing to schedule a no-op watcher." >&2
  exit 1
fi
ALLOWLIST_REGEX='<(PR_NUMBER|OWNER|REPO|REPO_PATH|HEAD_BRANCH|BASE_BRANCH)>'
if printf '%s' "$ASSEMBLED_PROMPT" | grep -Eq "$ALLOWLIST_REGEX"; then
  echo "Sentinel: WATCH_REJECTED — CronCreate-time placeholder still present in prompt; re-render before scheduling." >&2
  exit 1
fi
```

`${...}` placeholders and report-template tokens like `<N>` / `<file>` are intentional and exempt by construction (the regex only matches the six static placeholders by name).

**Note on shell syntax in the watcher prompt below**: the watcher agent reads each numbered step as INSTRUCTIONS, not as a verbatim bash script. When you see `set CYCLE_HEAD_SHA = ...` it means "compute the value via the shown command, store it as the cycle-local variable named `CYCLE_HEAD_SHA`, refer to it later as `${CYCLE_HEAD_SHA}`". When the watcher does run shell, the assignment is `CYCLE_HEAD_SHA=$(...)` (bare LHS — bash assignment never uses `${VAR}=...` on the LHS).

### CronCreate parameters

- cron: `*/2 * * * *`
- recurring: true
- prompt: The prompt below, with `<UPPERCASE>` CronCreate-time placeholders substituted and `${CYCLE_*}` placeholders left intact:

```text
You are the PR fix watcher for PR #<PR_NUMBER> in <OWNER>/<REPO>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

Every shell command below must be checked for non-zero exit. On ANY non-zero exit, say "Sentinel: WATCH_TRANSIENT_ERROR — step <N> (<command>): <stderr>" and end this cycle. Do NOT proceed with stale or empty values.

CYCLE START:

1. CHECK PR STATE:
   set CYCLE_PR_STATE = `cd <REPO_PATH> && gh pr view <PR_NUMBER> --json state --jq '.state'` — abort cycle if gh fails or returns whitespace-only.
   If ${CYCLE_PR_STATE} is not "OPEN": say "Sentinel: WATCH_PR_CLOSED — PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting." and end.

2. FETCH AND SYNC:
   Pre-condition (CRITICAL): the working tree MUST be clean before `gh pr checkout` runs. A prior cycle that crashed mid-Edit can leave unstaged modifications that `gh pr checkout` does not clean up, and that the next steps would silently carry forward.

   Pre-condition A — `git status` must succeed AND the tree must be clean:
   set CYCLE_WORKTREE_STATUS = `cd <REPO_PATH> && git status --porcelain`
   Check the `git status` exit code separately from the captured stdout: if `git status` itself exits non-zero (corrupted index, lock contention, missing .git/), say "Sentinel: WATCH_TRANSIENT_ERROR — step 2 (git status failed: <stderr>)." and end — do NOT proceed to inspect emptiness.
   If ${CYCLE_WORKTREE_STATUS} is non-empty (tree is dirty): truncate it for the sentinel — set CYCLE_WORKTREE_DIRTY_COUNT = `printf '%s' "${CYCLE_WORKTREE_STATUS}" | wc -l`, set CYCLE_WORKTREE_DIRTY_FIRST = `printf '%s' "${CYCLE_WORKTREE_STATUS}" | head -n1`. Then say "Sentinel: WATCH_TRANSIENT_ERROR — step 2 (working tree dirty: ${CYCLE_WORKTREE_DIRTY_COUNT} modified path(s); first: ${CYCLE_WORKTREE_DIRTY_FIRST}). Manual cleanup required." and end. (Do NOT auto-checkout/auto-stash — a human must inspect and decide.)

   Pre-condition B — no orphan watcher stash from a crashed prior cycle. Capture `git stash list` and its exit code separately (do NOT pipe with `|| true` — that would mask a `git stash list` failure as "no orphans"):
   set CYCLE_STASH_LIST = `cd <REPO_PATH> && git stash list --format='%gs'` — abort cycle (WATCH_TRANSIENT_ERROR) if `git stash list` exits non-zero (corrupted stash store, missing .git/refs/stash, lock contention).
   set CYCLE_ORPHAN_STASHES = `printf '%s' "${CYCLE_STASH_LIST}" | grep -E 'pr-fix watcher: lint-aborted cycle' || true`
   set CYCLE_ORPHAN_COUNT = `printf '%s' "${CYCLE_ORPHAN_STASHES}" | grep -c '.' || true`
   If ${CYCLE_ORPHAN_COUNT:-0} > 0: capture a single-line summary for the sentinel (the orphan list is multi-line — emit only the count + first match's subject in the sentinel itself, full list to stderr): set CYCLE_ORPHAN_FIRST = `printf '%s' "${CYCLE_ORPHAN_STASHES}" | head -n1`. Print the full list with `printf '%s\n' "${CYCLE_ORPHAN_STASHES}" >&2`. Then say (single grep-able line): "Sentinel: WATCH_TRANSIENT_ERROR — step 2 (${CYCLE_ORPHAN_COUNT} orphan watcher stash(es) detected; first: ${CYCLE_ORPHAN_FIRST}). A prior cycle crashed between stash-push and stash-drop. Resolve manually: list current orphan refs with \`git stash list --format='%gd %gs' | grep -F 'pr-fix watcher: lint-aborted cycle'\`, then drop each one HIGHEST-INDEX-FIRST (e.g. \`git stash drop stash@{2}\` then \`stash@{1}\` then \`stash@{0}\`) so positional refs of remaining stashes don't shift mid-loop. \`git stash drop\` accepts only stash refs, NOT commit SHAs." and end.

   Then run: cd <REPO_PATH> && git fetch origin && gh pr checkout <PR_NUMBER> — abort cycle on any non-zero exit.
   (`gh pr checkout` is cross-fork-safe — it handles fork PRs and existing local branches.)
   Post-condition: re-query the PR's expected head SHA via `gh pr view <PR_NUMBER> --json headRefOid --jq '.headRefOid'`, store as ${CYCLE_EXPECTED_HEAD_SHA}, then check `git rev-parse HEAD` matches; abort cycle if mismatch (partial checkout).

3. CHECK MERGE CONFLICTS:
   Run: cd <REPO_PATH> && git merge --no-commit --no-ff origin/<BASE_BRANCH> 2>&1
   - If clean (or already up to date): run `git rev-parse --verify MERGE_HEAD >/dev/null 2>&1 && git merge --abort || true` and continue to step 4.
   - If conflicts: for each conflicting file, read it with the Read tool, resolve conflict markers using the Edit tool (keep PR changes if intentional, incorporate base changes if necessary, merge both logically). Then: `git add <resolved files>` and use a heredoc commit. `<BASE_BRANCH>` is in the CronCreate-time allowlist so it is substituted into the prompt before the watcher receives it; the single-quoted MERGEEOF preserves the substituted literal verbatim, with no shell injection (the heredoc itself blocks $-interpolation):
       git commit -m "$(cat <<'MERGEEOF'
merge: resolve conflicts with <BASE_BRANCH>

Resolved merge conflicts in:
- <file1>
- <file2>
MERGEEOF
)"
     Capture the resulting SHA: set CYCLE_MERGE_SHA = `git rev-parse HEAD`. Then `git push origin <HEAD_BRANCH>`. Report ${CYCLE_MERGE_SHA} and the resolved files in this cycle's WATCH_FIX_DONE sentinel below.
   - If conflicts are too ambiguous: `git merge --abort`, set CYCLE_MERGE_AMBIGUOUS = `<list of files>`, continue to step 4. Step 6 must NOT emit WATCH_FIX_GREEN while this flag is set — see Step 6 for the gate.

4. CHECK CI:
   set CYCLE_FAILED_CHECKS = `cd <REPO_PATH> && gh pr checks <PR_NUMBER> --json name,bucket,link --jq '.[] | select(.bucket == "fail")'` — abort cycle if gh fails (non-zero exit, distinct from "no failures").
   If ${CYCLE_FAILED_CHECKS} is non-empty:
   a. set CYCLE_RUN_ID = `gh pr checks <PR_NUMBER> --json bucket,link --jq '.[] | select(.bucket == "fail") | .link | capture("/runs/(?<id>[0-9]+)") | .id' | head -1`
   b. Get logs: `gh run view "${CYCLE_RUN_ID}" --repo <OWNER>/<REPO> --log-failed`
   c. If caused by a recent fix commit: apply corrective fix, commit "fix: address CI failure", set CYCLE_HEAD_SHA = `git rev-parse HEAD`, push (max 2 retries). If both retries fail: stop retrying, fall through to step 5 with `${CYCLE_FAILED_CHECKS}` non-empty (so Step 7g emits `ci=FAIL`); the next 2-minute cycle will re-evaluate the failure against any new state.
   d. If pre-existing: note it, do not fix.

5. FETCH UNRESOLVED REVIEW COMMENTS using gh api graphql (same query shape as Step 4 of the main flow — request `pageInfo { hasNextPage endCursor }` and abort the cycle with WATCH_TRANSIENT_ERROR if `hasNextPage` is true; pagination not implemented inline). Required field set: id, isResolved, isOutdated, comments.nodes.{databaseId, body, path, originalLine, createdAt, author.login}.
   Filter to threads where isResolved=false AND isOutdated=false.
   For each thread: extract threadId (the node id), path, line (originalLine), body (use the **most recent** comment in the thread for the latest guidance), commentId (databaseId of the **first** comment, for the in_reply_to reply target), author, createdAt.
   Parse severity case-insensitively from the comment body.

6. EVALUATE:
   If zero unresolved comments AND CI passing AND no conflicts AND ${CYCLE_MERGE_AMBIGUOUS:-} is empty: say "Sentinel: WATCH_FIX_GREEN — PR #<PR_NUMBER> is green (no unresolved comments, CI passing, no conflicts)." and end this cycle.
   If ${CYCLE_MERGE_AMBIGUOUS:-} is non-empty: say "Sentinel: WATCH_TRANSIENT_ERROR — step 3 (merge with <BASE_BRANCH> hit ambiguous conflicts in: ${CYCLE_MERGE_AMBIGUOUS}). Aborted; needs human resolution." and end this cycle. (Do NOT emit WATCH_FIX_GREEN — the PR is not actually green.)

7. APPLY FIXES for unresolved comments:

   **Never apply a fix you don't fully understand. A skipped finding is always better than a wrong fix.**

   **Confidence gate (BEFORE any edit):** For each unresolved comment, run the same triage as the main flow's Step 5a–5f:
   - Classify into one of seven categories per main flow Step 5a + Mixed-purpose handling: actionable+fixed, actionable+skipped, question, discussion, praise, already-addressed, stale (Mixed-purpose with both Question and Actionable → take actionable path and acknowledge the question in the reply).
   - For each actionable comment: read the file at the comment's path+line and verify the referenced code still exists / hasn't been already fixed in a later commit (`git log --oneline --since="<comment_created_at>" -- <path>` — `createdAt` comes from the GraphQL query in step 5).
   - **Mandatory context-gathering:** read the project rules that govern the file:
       - root AGENTS.md (canonical, CLAUDE.md is a symlink),
       - MISSION.md,
       - docs/jsdoc-style.md if the fix touches an exported symbol or any JSDoc / @example,
       - if the file is under packages/<pkg>/, also packages/<pkg>/AGENTS.md/README.md/ARCHITECTURE.md,
       - any nested AGENTS.md along the path of the touched file,
       - for files outside packages/ the per-package step is skipped.
     Then read the FULL file, read all files imported by it, and use the Grep tool to find callers (this monorepo has no top-level test/ directory; tests live under packages/*/test/ and colocated next to source in morpho-sdk/evm-simulation). If the change is in a public API, also read packages/<pkg>/src/index.ts and any test file under packages/<pkg>/test/. You do NOT need to read every transitive import — focus on files directly relevant to the specific fix. Re-discover this context per cycle from THIS cycle's diff/touched files.
   - Assign Confidence: HIGH (proceed), Confidence: MEDIUM (proceed but flag in reply), Confidence: LOW (SKIP — record as "skipped: low confidence", reply with what's unclear, leave thread unresolved). Always prefix with `Confidence:` so the tokens never collide with severity.

   a. Group actionable + Confidence:HIGH/MEDIUM comments by file. For each file: apply fix with Edit tool per the comment suggestion (using the context already gathered above).
   b. Run `pnpm exec biome check` on modified files (or `pnpm lint` for the project-wide check). On lint failure, REVERT the just-applied edits before ending the cycle (otherwise the next cycle's clean-tree gate at Step 2 will refuse, looking like a transient error). Use `git stash push -u` (NOT raw `git checkout --`): `git checkout --` is destructive and would also discard any orphaned modifications that pre-existed this cycle's Edit calls — the stash form preserves them in the reflog so a human can recover if needed:

   - Run: `git stash push -u -m "pr-fix watcher: lint-aborted cycle ${CYCLE_HEAD_SHA:-pre-push}"` — capture exit code; if stash itself fails, fall through to a hard abort (`Sentinel: WATCH_TRANSIENT_ERROR — step 7b (git stash failed: <stderr>)`).
   - Capture the stash COMMIT SHA BEFORE attempting to drop (positional refs like `stash@{0}` shift whenever any new stash is pushed; the commit SHA is stable):
     `set CYCLE_LINT_STASH_SHA = \`git rev-parse stash@{0}\`` — abort cycle on non-zero exit.
   - Run: `git stash drop stash@{0}` and capture its exit code.
     - If `git stash drop` SUCCEEDS: say `Sentinel: WATCH_LINT_FAILED — PR #<PR_NUMBER> cycle aborted; lint rejected the proposed fix; working tree restored (stashed at ${CYCLE_LINT_STASH_SHA} then dropped — recoverable from the reflog by SHA).` and end the cycle.
     - If `git stash drop` FAILS (rare — stash ref moved, locked index): the stash entry persists. Emit a degraded sentinel referencing the STABLE COMMIT SHA (NOT the positional `stash@{0}` ref, which may now point to a different stash if the user created one in the meantime): `Sentinel: WATCH_LINT_FAILED — PR #<PR_NUMBER> cycle aborted; lint rejected the proposed fix; stash retained as commit ${CYCLE_LINT_STASH_SHA} (currently at stash@{0} but may shift) — drop failed: <stderr>. Resolve manually: \`git stash list --format='%H %gd' | grep ^${CYCLE_LINT_STASH_SHA}\` shows the current stash@{N} ref, then \`git stash drop stash@{N}\`. \`git stash drop\` accepts only stash refs, NOT commit SHAs — the SHA above is a stable identifier for locating the ref, not a drop target.` and end the cycle.

   **Recovery procedure (if a maintainer wants to inspect the discarded fix after a `WATCH_LINT_FAILED`):**

   Even after `git stash drop`, the stash COMMIT remains in `git fsck --unreachable` for `gc.reflogExpire` (default 90 days). To recover:

   ```bash
   # 1. Find unreachable stash commits.
   git fsck --unreachable --no-reflogs 2>/dev/null | grep '^unreachable commit' | awk '{print $3}' | while read sha; do
     git log -1 --format='%H %s' "$sha" | grep -q 'pr-fix watcher: lint-aborted cycle' && echo "$sha"
   done

   # 2. Apply (or just inspect) the SHA you want.
   git stash apply <sha>
   # OR
   git show <sha>
   ```
   c. Stage: `git add <changed files>` (verify only fix-related files are staged with `git diff --cached --name-only`; unstage unrelated files with `git reset HEAD <file>` if needed).
   d. Commit: `git commit -m "$(cat <<'INNEREOF'
fix: address PR review findings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
INNEREOF
)"`
   e. Push: `git push origin <HEAD_BRANCH>` — set CYCLE_HEAD_SHA = `git rev-parse HEAD` (the SHA produced by THIS cycle's push, NOT a CronCreate-time value).

   f. **Per-category replies + resolves**: follow main-flow Step 9 (the routing table is in Step 5f; the reply + resolve mechanisms and per-category sub-steps are in Step 9). Substitute `${CYCLE_HEAD_SHA}` for `<HEAD_SHA>` in the actionable+fixed and Mixed-purpose rows — that is the only intentional difference between main flow and watcher. Non-actionable categories (praise, already-addressed via current-code, stale, question, discussion) MUST NOT reference `${CYCLE_HEAD_SHA}` — it may be unset on cycles where step e never ran.

      Track bucket counts (`<F>`, `<SK>`, `<Q>`, `<D>`, `<P>`, `<A>`, `<ST>`, `<R>`) for use in step g's sentinel.

   g. Determine the cycle's CI verdict for the sentinel. The watcher's Step 4 captures only `${CYCLE_FAILED_CHECKS}` (one-shot, no poll). Pending checks are NOT captured because the cycle runs every 2 minutes anyway — a still-running CI is just picked up by the next cycle. Therefore the watcher's `ci=` value space is `FAIL` / `NA` / `UNKNOWN`:
     - `FAIL` — `${CYCLE_FAILED_CHECKS}` is non-empty.
     - `NA` — the cycle made no commit AND no CI run was triggered (e.g. WATCH_FIX_GREEN path, or cycle ended at WATCH_LINT_FAILED before push). Step 7g is reached only on the actual fix-and-push branch, so `NA` is rare here but reserved for completeness.
     - `UNKNOWN` — fix was pushed and `${CYCLE_FAILED_CHECKS}` is empty (could be PASS, could be PENDING; the watcher does not distinguish — that's `FIX_DONE_PR`'s job, which polls with a timeout).

   Set CYCLE_CI_VERDICT accordingly, then say:
   "Sentinel: WATCH_FIX_DONE — PR #<PR_NUMBER> cycle complete: <F> fixed-and-resolved, <SK> skipped-with-reply, <Q> questions, <D> discussions, <P> praise-resolved, <A> already-addressed-resolved, <ST> stale-skipped. Merge SHA: ${CYCLE_MERGE_SHA:-none}. Push SHA: ${CYCLE_HEAD_SHA:-none}. Resolved <R> threads. ci=${CYCLE_CI_VERDICT}." — labels match RECONCILE_OK so a parser can grep either with the same regex.

CYCLE END — the cron scheduler will run this again in 2 minutes.
```

**After CronCreate returns the job ID:**

1. Report the job ID to the user
2. Tell them they can cancel with `CronDelete` using that ID
3. Note that the watcher auto-expires after 3 days
4. Only THEN is the skill complete

## Sentinel grammar registry

Every terminal step ends with a single grep-able `Sentinel: NAME — <human prose>` line. Sentinel names and trailer field order are part of the contract — rename or reorder fields only with a deprecation note in this table.

| Sentinel | Owning step | Fires on | Trailer grammar |
|---|---|---|---|
| `RECONCILE_OK` | Step 9.5 | Reconciliation pass succeeded (every thread in a Step 5a terminal state) | `— <N> threads addressed (<F> fixed-and-resolved, <SK> skipped-with-reply, <Q> questions, <D> discussions, <P> praise-resolved, <A> already-addressed-resolved, <ST> stale-skipped).` |
| `RECONCILE_FAILED` | Step 9.5 | At least one thread in unknown terminal state | `— <N> threads in unknown state: <id1> <id2> <id3>.` (single line, space-separated IDs — shell-friendly for `for id in` loops) |
| `FIX_DONE_PR` | Step 11 | Terminal sentinel for the `/pr-fix <PR>` (no `--watch`) run | `— PR #<PR_NUMBER>, fixed <N>, skipped <M>, resolved <R>, ci=<PASS\|FAIL\|PENDING\|PENDING_TIMEOUT\|NA>, commit=<HEAD_SHA_SHORT>` |
| `WATCH_REJECTED` | Step 12 pre-flight | Empty/whitespace-only prompt OR un-substituted CronCreate-time placeholder | `— <reason>` |
| `WATCH_TRANSIENT_ERROR` | Step 12 watcher (any cycle command) | Any non-zero exit; OR dirty tree at cycle start; OR orphan watcher stash detected. **Permanent failures (branch-protection rejection on push, expired auth) flow through this same sentinel and recur every cycle until the watcher expires (3 days) or `CronDelete` runs.** | `— step <N> (<command>): <stderr>` |
| `WATCH_PR_CLOSED` | Step 12 watcher Step 1 | PR is no longer OPEN | `— PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting.` |
| `WATCH_FIX_GREEN` | Step 12 watcher Step 6 | Cycle has zero unresolved comments AND CI passing AND no conflicts AND no ambiguous-merge flag | `— PR #<PR_NUMBER> is green (no unresolved comments, CI passing, no conflicts).` |
| `WATCH_LINT_FAILED` | Step 12 watcher Step 7b | Lint rejected the proposed fix; cycle aborted with stash-and-drop revert | `— PR #<PR_NUMBER> cycle aborted; lint rejected the proposed fix; working tree restored (stashed at <SHA> then dropped — recoverable from the reflog by SHA).` |
| `WATCH_FIX_DONE` | Step 12 watcher Step 7g | Cycle completed (some categories may be 0) | `— PR #<PR_NUMBER> cycle complete: <F> fixed-and-resolved, <SK> skipped-with-reply, <Q> questions, <D> discussions, <P> praise-resolved, <A> already-addressed-resolved, <ST> stale-skipped. Merge SHA: ${CYCLE_MERGE_SHA:-none}. Push SHA: ${CYCLE_HEAD_SHA:-none}. Resolved <R> threads. ci=<FAIL\|NA\|UNKNOWN>.` (watcher's Step 4 is one-shot, no poll — distinguishing PASS from PENDING requires the poll loop in `FIX_DONE_PR`'s Step 10c) |

The `WATCH_FIX_DONE` and `RECONCILE_OK` count buckets use **identical labels** (`F` / `SK` / `Q` / `D` / `P` / `A` / `ST`) so a downstream parser can grep either with the same regex.

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
- **Pairs with the `/pr-review-*` skills**: `/pr-review-local` for pre-PR feedback (terminal-only, no GitHub), `/pr-review-gh <PR>` for inline GitHub review after opening, `/pr-fix <PR>` to apply posted comments. With `/pr-review-gh <PR> --watch` plus `/pr-fix <PR> --watch`, the review-fix loop is fully autonomous (the two crons are independent — both fire every 2 minutes; no cross-cron coordination today).
- Fixes are applied to the PR branch, not main/dev
- One commit for all fixes — keeps the PR history clean
- Each reply includes the commit SHA for traceability
- Skipped findings are explicitly noted but left unresolved for humans
- The cron watcher auto-expires after 3 days per system limits
- The skill assumes it is invoked from within the git repository

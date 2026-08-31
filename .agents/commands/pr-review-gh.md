# pr-review-gh

Local PR review. Posts an inline GitHub review as a `COMMENT` (never auto-approves or requests changes — leave that decision to humans). Optionally schedules a 2-minute watcher cron via `--watch`.

## Usage

```
/pr-review-gh <PR_NUMBER>
/pr-review-gh <PR_NUMBER> --watch
```

Pre-conditions:

- A `<PR_NUMBER>` is required.
- Must run **locally** (NOT in CI). If `CI=true` or `GITHUB_ACTIONS=true`, abort and tell the user to use `/pr-review-ci` instead.
- `--local` is not supported (use `/pr-review-local` for that).

If `--watch` is passed, the skill is not complete until Step 9's CronCreate succeeds and you report the job ID.

## Step 1: Validate environment + arguments

```bash
if [ "$CI" = "true" ] || [ "$GITHUB_ACTIONS" = "true" ]; then
  echo "pr-review-gh is for local PR review. Use /pr-review-ci in CI." >&2
  exit 1
fi
if [ -z "${1:-}" ]; then
  echo "pr-review-gh requires a PR number." >&2
  exit 1
fi
```

Parse `<OWNER>` and `<REPO>` from `git remote get-url origin`. If `--watch` was passed, also capture `<BOT_LOGIN>=$(gh api user --jq '.login')` for use in Step 9.

## Step 2: Fetch PR details

Same as `/pr-review-ci` Step 2: `gh pr view <PR_NUMBER>`, capture and validate `<BASE_BRANCH>`, `<HEAD_BRANCH>`, `<HEAD_SHA>`, ensure `state == OPEN`. Use whitespace-only validation. Then `git fetch origin`.

## Steps 3–6: Shared review base

**Read `.agents/pr-review-engine/SKILL.md` and follow Steps 3–6 there**, with these inputs:

- `<DIFF_SOURCE>` = `pr`
- `<HEAD_REF>` = `origin/<HEAD_BRANCH>`
- `<INTENT_CONTEXT>` = the PR title + body (from `gh pr view` in Step 2) followed by the changed-commit messages, so agents can tell a deliberate, documented change from a regression.

Steps 3–6 produce: `<FINDINGS>` (each carrying `snapped_line`), `<DROPPED_FINDINGS>`, `<FAILED_AGENTS>`, `<COUNTS>`, `<DROPPED_COUNTS>`, `<TOTAL_AGENTS_LAUNCHED>`.

## Step 6b: Findings ledger (PR-keyed, stateful)

So re-reviews of an evolving PR don't re-surface findings already seen or deferred, merge this run's `<FINDINGS>` into a persisted ledger keyed by PR number (distinct from `/pr-review-local`'s `branch-<name>` key). The ledger lives **outside** the repo:

```bash
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')   # owner/repo
LEDGER_DIR=${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}
LEDGER="$LEDGER_DIR/${slug%%/*}-${slug##*/}-pr<PR_NUMBER>.json"
# Write the <FINDINGS> array to /tmp first, then:
node .agents/pr-review-engine/scripts/findings-ledger.ts \
  --ledger "$LEDGER" --findings /tmp/pr-review-gh-<PR_NUMBER>-findings.json --head-sha "<HEAD_SHA>" --write \
  || echo "findings-ledger failed; continuing with the plain (stateless) review output." >&2
```

Drop every `suppressed` (wontfix) finding from the posted comments; tag `net_new` findings **[NEW]** in the comment body. If the merge fails, post the plain stateless review with no NEW/seen tags.

## Step 7: Post the review as `COMMENT`

Build a JSON object at `/tmp/pr-review-gh-<PR_NUMBER>-comments.json`:

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "COMMENT",
  "body": "<REVIEW_BODY>",
  "comments": [...]
}
```

Always use `"event": "COMMENT"` — never auto-approve or request changes in local PR mode.

Anchor each entry in `comments[]` on the finding's `snapped_line` (the nearest actual diff line) — the reviews API rejects any comment whose line is not an exact diff line. If `<DROPPED_FINDINGS>` is non-empty, append a collapsible `<details>` "Audit trail" section to the body summarizing `<DROPPED_COUNTS>` (file-level / line-level / doc-example) — never silently nuke dropped findings.

### Body format

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

If `<FAILED_AGENTS>` is non-zero, prepend `> WARNING: <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete.` to the body.

If zero findings AND zero failures, submit with an empty `comments[]` and a body saying `Sentinel: REVIEW_CLEAN — no issues found in this review.`. If zero findings BUT non-zero failures, the body must instead say `Sentinel: REVIEW_INCOMPLETE — <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.`

### Submit

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  --input "$REVIEW_FILE"
```

Atomic — no partial reviews. Clean up: `rm -f "$REVIEW_FILE"`. Fallback on failure: single PR-level comment via `gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments`.

## Step 8: Report

Print a single grep-able sentinel:

```
Sentinel: REVIEW_DONE_PR — PR #<PR_NUMBER>, <N> findings, mode=LocalPR, commit=<HEAD_SHA_SHORT>
```

If `--watch` was NOT passed, the skill is complete here. If `--watch` WAS passed, proceed to Step 9.

## Step 9: Schedule the watcher (only with --watch)

Use `CronCreate` to schedule a recurring job every 2 minutes (`*/2 * * * *`, recurring: true).

### Placeholder discipline (CRITICAL)

Two kinds of placeholders in the watcher prompt:

- **CronCreate-time placeholders** (substitute BEFORE CronCreate): `<PR_NUMBER>`, `<OWNER>`, `<REPO>`, `<REPO_PATH>`, `<HEAD_BRANCH>`, `<BASE_BRANCH>`, `<BOT_LOGIN>`. These seven are static.
- **Cycle-derived** (do NOT substitute): `${CYCLE_HEAD_SHA}`, `${CYCLE_HEAD_SHA_SHORT}`, `${CYCLE_PR_STATE}`, `${CYCLE_LAST_REVIEWED_SHA}`, `${CYCLE_MERGE_BASE}`, `${CYCLE_FAILED_AGENTS}`, `${CYCLE_LAST_REVIEWED_RAW}`. Computed inside each cycle.

**Pre-flight before CronCreate**: refuse empty/whitespace-only prompt; refuse if any of the seven static placeholders remain unsubstituted.

```
if [ -z "${ASSEMBLED_PROMPT//[[:space:]]/}" ]; then
  echo "Sentinel: WATCH_REJECTED — assembled prompt is empty or whitespace-only." >&2
  exit 1
fi
ALLOWLIST_REGEX='<(PR_NUMBER|OWNER|REPO|REPO_PATH|HEAD_BRANCH|BASE_BRANCH|BOT_LOGIN)>'
if printf '%s' "$ASSEMBLED_PROMPT" | grep -Eq "$ALLOWLIST_REGEX"; then
  echo "Sentinel: WATCH_REJECTED — CronCreate-time placeholder still present." >&2
  exit 1
fi
```

### Watcher prompt

```text
You are the PR review watcher for PR #<PR_NUMBER> in <OWNER>/<REPO>.
Repo path: <REPO_PATH>
Head branch: <HEAD_BRANCH>
Base branch: <BASE_BRANCH>
Bot login: <BOT_LOGIN>

This is a RECURRING cron job. Each run is one check cycle. After completing a cycle, simply end your response — the cron scheduler will invoke you again in 2 minutes.

Every shell command below must be checked for non-zero exit. On ANY non-zero exit, say "Sentinel: WATCH_TRANSIENT_ERROR — step <N> (<command>): <stderr>" and end this cycle.

Note on shell syntax: `set CYCLE_X = ...` is pseudocode for `CYCLE_X=$(cmd)` (bare LHS — bash assignment never uses `${VAR}=...`). The `${CYCLE_*}` form is for reading.

CYCLE START:

1. FETCH AND CHECK STATE:
   Run: cd <REPO_PATH> && git fetch origin
   set CYCLE_HEAD_SHA = `git rev-parse origin/<HEAD_BRANCH>` — abort if empty.
   set CYCLE_PR_STATE = `gh pr view <PR_NUMBER> --repo <OWNER>/<REPO> --json state --jq '.state'` — abort if gh fails or returns whitespace-only.
   If ${CYCLE_PR_STATE} is not "OPEN": say "Sentinel: WATCH_PR_CLOSED — PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting." and end.
   set CYCLE_HEAD_SHA_SHORT = first 7 chars of ${CYCLE_HEAD_SHA}.

2. GET LAST REVIEWED SHA. Use --arg login binding (NOT passing --arg to gh api itself):
   set CYCLE_LAST_REVIEWED_RAW = `gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews?per_page=100`
   If gh exit code != 0: abort cycle with WATCH_TRANSIENT_ERROR (do NOT fall through to "review everything").
   set CYCLE_LAST_REVIEWED_SHA = `printf '%s' "${CYCLE_LAST_REVIEWED_RAW}" | jq --arg login "<BOT_LOGIN>" -r '[.[] | select(.user.login == $login or ((.body // "") | test("Parallel PR Review|Code Review Summary")))] | sort_by(.submitted_at) | last | .commit_id // ""'`
   If gh exit was zero AND ${CYCLE_LAST_REVIEWED_SHA} is empty: proceed with empty value (review everything on first sighting).

3. COMPARE SHA:
   If ${CYCLE_HEAD_SHA} == ${CYCLE_LAST_REVIEWED_SHA}: say "Sentinel: WATCH_REVIEW_CLEAN — PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review." and end this cycle.

4. NEW COMMIT DETECTED:
   Say "New commit detected on PR #<PR_NUMBER>: ${CYCLE_HEAD_SHA}. Running full review..."

5. **Read `.agents/pr-review-engine/SKILL.md` and follow Steps 3–6 there**, with:
   - <DIFF_SOURCE> = pr
   - <HEAD_REF> = origin/<HEAD_BRANCH>
   - <BASE_BRANCH> = <BASE_BRANCH>
   - re-discover PROJECT_CONTEXT per cycle (do NOT cache from earlier cycles).

   The base produces: <FINDINGS> (each carrying snapped_line), <DROPPED_FINDINGS>, ${CYCLE_FAILED_AGENTS}, <COUNTS>, <TOTAL_AGENTS_LAUNCHED>.

5b. APPLY THE PR-KEYED LEDGER (stateful re-review — same as the initial run's Step 6b):
   Without this, a watched PR reposts findings already marked `wontfix` or seen before on every new commit, defeating the stateful re-review. Merge the cycle's <FINDINGS> into the PR-keyed ledger (git-only; the ledger lives outside the repo):
   Run: slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
   set LEDGER = ${FACETS_LEDGER_DIR:-$HOME/.claude/facets/reviews}/${slug%%/*}-${slug##*/}-pr<PR_NUMBER>.json
   Write the cycle <FINDINGS> array to /tmp/pr-review-gh-<PR_NUMBER>-cycle-findings.json, then:
   node <REPO_PATH>/.agents/pr-review-engine/scripts/findings-ledger.ts --ledger "$LEDGER" --findings /tmp/pr-review-gh-<PR_NUMBER>-cycle-findings.json --head-sha ${CYCLE_HEAD_SHA} --write || echo "ledger merge failed; posting the plain stateless review." >&2
   The merge prints net_new / recurring / resolved / suppressed. Drop every `suppressed` (wontfix) finding from the comments[] built in step 6, and tag `net_new` findings as **[NEW]** in their comment body. If the merge command fails, post the plain review (no NEW/suppressed handling).

6. POST REVIEW to GitHub as a single atomic call:
   Build a JSON file at /tmp/pr-review-gh-<PR_NUMBER>-cycle.json with commit_id=${CYCLE_HEAD_SHA} (NOT a CronCreate-time SHA), event="COMMENT", body (summary table), and comments[] array.
   If ${CYCLE_FAILED_AGENTS} > 0, prepend "> WARNING: ${CYCLE_FAILED_AGENTS} of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>) — review may be incomplete." to the body.
   Run: gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --method POST --input /tmp/pr-review-gh-<PR_NUMBER>-cycle.json — abort cycle if non-zero exit.
   Clean up: rm -f /tmp/pr-review-gh-<PR_NUMBER>-cycle.json

7. Say "Sentinel: WATCH_REVIEW_DONE — PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low)."

CYCLE END — the cron scheduler will run this again in 2 minutes.
```

After CronCreate returns the job ID:

1. Report the job ID to the user.
2. Tell them they can cancel with `CronDelete` using that ID.
3. Note that the watcher auto-expires after 3 days.

## Notes

- **`COMMENT` event only** — never auto-approve or request changes in local PR mode. The user reviews findings and decides.
- **`--watch` semantics**: 2-minute cron, self-contained per cycle (no CronCreate-time SHA leakage), watcher cycles re-discover project context per cycle.

## Sentinel grammar

| Sentinel | Owning step | Trailer grammar |
|---|---|---|
| `REVIEW_CLEAN` | Step 7 | `— no issues found in this review.` (zero findings, zero agent failures) |
| `REVIEW_INCOMPLETE` | Step 7 | `— <FAILED_AGENTS> of <TOTAL_AGENTS_LAUNCHED> agents failed (<names>); no findings does NOT mean clean.` (zero findings BUT some agents crashed) |
| `REVIEW_DONE_PR` | Step 8 | `— PR #<PR_NUMBER>, <N> findings, mode=LocalPR, commit=<HEAD_SHA_SHORT>` |
| `WATCH_REJECTED` | Step 9 pre-flight | `— <reason>` (empty/whitespace prompt OR un-substituted CronCreate-time placeholder) |
| `WATCH_TRANSIENT_ERROR` | Step 9 watcher (any cycle command) | `— step <N> (<command>): <stderr>` (any non-zero exit; permanent failures recur every cycle until CronDelete) |
| `WATCH_PR_CLOSED` | Step 9 watcher Step 1 | `— PR #<PR_NUMBER> state=${CYCLE_PR_STATE}, watcher exiting.` |
| `WATCH_REVIEW_CLEAN` | Step 9 watcher Step 3 | `— PR #<PR_NUMBER> still at ${CYCLE_HEAD_SHA_SHORT}, no new commits since last review.` |
| `WATCH_REVIEW_DONE` | Step 9 watcher Step 7 | `— PR #<PR_NUMBER> commit ${CYCLE_HEAD_SHA_SHORT}: <N> findings (X critical, Y high, Z medium, W low).` |

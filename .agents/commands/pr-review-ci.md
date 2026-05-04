# pr-review-ci

CI-mode pull request review. Posts an inline GitHub review with a formal `APPROVE` / `REQUEST_CHANGES` verdict. Runs in GitHub Actions on a PR.

## Usage

```
/pr-review-ci <PR_NUMBER>
```

Pre-conditions:

- `CI=true` OR `GITHUB_ACTIONS=true` MUST be set in the environment.
- A `<PR_NUMBER>` argument is required.
- `--watch` is not supported (no cron in CI).
- `--local` is not supported (use `/pr-review-local` for that).

If any pre-condition fails, abort with a clear error and exit 1.

## Step 1: Validate environment + arguments

```bash
if [ "$CI" != "true" ] && [ "$GITHUB_ACTIONS" != "true" ]; then
  echo "pr-review-ci must run in CI (CI=true or GITHUB_ACTIONS=true). Use /pr-review-gh for local-PR review." >&2
  exit 1
fi
if [ -z "${1:-}" ]; then
  echo "pr-review-ci requires a PR number." >&2
  exit 1
fi
```

Parse `<OWNER>` and `<REPO>` from `git remote get-url origin` (handles both `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git`).

## Step 2: Fetch PR details

```bash
PR_JSON=$(gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,headRefOid,state 2>&1)
if [ $? -ne 0 ]; then
  echo "gh pr view <PR_NUMBER> failed: $PR_JSON" >&2
  exit 1
fi
```

Extract `<BASE_BRANCH>`, `<HEAD_BRANCH>`, `<HEAD_SHA>`, `state`. Validate that all three branch/SHA fields are non-empty AND not whitespace-only (use `[ -z "${X//[[:space:]]/}" ]` — bare `[ -z "$X" ]` lets whitespace pass). If `state` is not `OPEN`, inform the user and stop. Then `git fetch origin`.

## Steps 3–6: Shared review base

**Read `.agents/lib/pr-review-base.md` and follow Steps 3–6 there**, with these inputs:

- `<DIFF_SOURCE>` = `pr` (use `origin/<BASE_BRANCH>...origin/<HEAD_BRANCH>`)
- `<HEAD_REF>` = `origin/<HEAD_BRANCH>`

Steps 3–6 produce: `<FINDINGS>` (sorted, deduplicated), `<FAILED_AGENTS>` (count + names), `<COUNTS>` (severity totals). These flow into Step 7.

## Step 7: Post the formal review (atomic)

Build a JSON object with all findings. Write to a PR-specific temp file:

```bash
REVIEW_FILE="/tmp/pr-review-ci-<PR_NUMBER>-comments.json"
```

Structure:

```json
{
  "commit_id": "<HEAD_SHA>",
  "event": "<APPROVE|REQUEST_CHANGES>",
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

### Verdict

| Verdict | When | Event |
|---|---|---|
| **Approve** | No critical or high issues AND `<FAILED_AGENTS>` is zero | `APPROVE` |
| **Request Changes** | Any critical, OR multiple high, OR `<FAILED_AGENTS>` is non-zero | `REQUEST_CHANGES` |

When agents have failed, never `APPROVE` — `REQUEST_CHANGES` with the WARNING line so a human resolves it.

### Body format

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

If `<FAILED_AGENTS>` is non-zero, prepend to the body BEFORE the verdict:

```
> WARNING: <FAILED_AGENTS> of 7 agents failed (<names>) — review may be incomplete.
```

### Submit

```bash
gh api repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews \
  --method POST \
  --input "$REVIEW_FILE"
```

This creates the review and all inline comments atomically — no partial reviews if something fails midway. Clean up: `rm -f "$REVIEW_FILE"`.

If the review creation fails (permissions, line numbers out of range), fall back to a single PR-level comment:

```bash
gh api repos/<OWNER>/<REPO>/issues/<PR_NUMBER>/comments
```

If there are zero findings AND zero failures, submit with empty `comments[]` and a body saying "No issues found in this review."

## Step 8: Report

Print a single grep-able sentinel:

```
Sentinel: REVIEW_DONE_PR — PR #<PR_NUMBER>, <N> findings, mode=CI, commit=<HEAD_SHA_SHORT>
```

(Drop the agent-failure prefix when `<FAILED_AGENTS>` is zero.)

## Notes

- **CI mode posts a formal verdict** with the `<!-- CLAUDE_REVIEW_COMPLETE -->` and `<!-- CLAUDE_VERDICT:APPROVE -->` markers consumed by the project's CI gates.
- **Local-first reads**: never use the GitHub API to read diffs or file contents — the local repo has everything.
- **Agent failures downgrade verdict**: any `<FAILED_AGENTS> > 0` forces `REQUEST_CHANGES` so a human handles it.
- **No `--watch`** in CI — the run is one-shot per PR push.
- **For pre-PR review**: use `/pr-review-local` (terminal-only, no GitHub interaction).
- **For local PR review with optional watcher**: use `/pr-review-gh`.
- **Sentinel registry, drift conventions, deprecation flow**: see `.agents/commands/AGENTS.md`.
